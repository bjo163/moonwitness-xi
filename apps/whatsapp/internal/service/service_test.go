package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"go.mau.fi/whatsmeow"
	waE2E "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

type fakeStorage struct {
	storedDevice *store.Device
	mapped       types.JID
	mu           sync.Mutex
}

func (f *fakeStorage) acquire(context.Context, int64) (*sql.Conn, bool, error) { return nil, true, nil }
func (f *fakeStorage) release(context.Context, *sql.Conn, int64)               {}
func (f *fakeStorage) device(context.Context, int64) (*store.Device, error) {
	if f.storedDevice == nil {
		f.storedDevice = &store.Device{}
	}
	return f.storedDevice, nil
}
func (f *fakeStorage) saveDeviceMapping(_ context.Context, _ int64, jid types.JID) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.mapped = jid
	f.storedDevice.ID = &jid
	return nil
}
func (f *fakeStorage) deleteDeviceMapping(context.Context, int64) error { return nil }

type fakeClient struct {
	mu        sync.Mutex
	handler   whatsmeow.EventHandler
	qr        chan whatsmeow.QRChannelItem
	sent      *waE2E.Message
	resultID  types.MessageID
	download  []byte
	connected bool
}

func newFakeClient() *fakeClient {
	return &fakeClient{qr: make(chan whatsmeow.QRChannelItem, 1), download: []byte("image-bytes"), resultID: "OUTBOUND-ID"}
}
func (f *fakeClient) Connect() error { f.connected = true; return nil }
func (f *fakeClient) Disconnect()    { f.connected = false }
func (f *fakeClient) AddEventHandler(h whatsmeow.EventHandler) uint32 {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.handler = h
	return 1
}
func (f *fakeClient) RemoveEventHandler(uint32) bool { return true }
func (f *fakeClient) GetQRChannel(context.Context) (<-chan whatsmeow.QRChannelItem, error) {
	return f.qr, nil
}
func (f *fakeClient) GenerateMessageID() types.MessageID { return "GENERATED" }
func (f *fakeClient) SendMessage(_ context.Context, _ types.JID, msg *waE2E.Message, _ ...whatsmeow.SendRequestExtra) (whatsmeow.SendResponse, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sent = msg
	return whatsmeow.SendResponse{ID: f.resultID}, nil
}
func (f *fakeClient) Upload(context.Context, []byte, whatsmeow.MediaType) (whatsmeow.UploadResponse, error) {
	return whatsmeow.UploadResponse{URL: "https://media", DirectPath: "/path", MediaKey: []byte("key"), FileSHA256: []byte("hash"), FileEncSHA256: []byte("enc"), FileLength: 11}, nil
}
func (f *fakeClient) Download(context.Context, whatsmeow.DownloadableMessage) ([]byte, error) {
	return f.download, nil
}
func (f *fakeClient) GetGroupInfo(context.Context, types.JID) (*types.GroupInfo, error) {
	return &types.GroupInfo{GroupName: types.GroupName{Name: "Test group"}}, nil
}
func (f *fakeClient) emit(event any) {
	f.mu.Lock()
	h := f.handler
	f.mu.Unlock()
	if h != nil {
		h(event)
	}
}

func TestConnectionQRPairAndReconnectStateUseWhatsmeowEvents(t *testing.T) {
	var mu sync.Mutex
	var status string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/internal/whatsapp/status" {
			var body map[string]any
			_ = json.NewDecoder(r.Body).Decode(&body)
			if value, ok := body["status"].(string); ok {
				mu.Lock()
				status = value
				mu.Unlock()
			}
			w.WriteHeader(200)
			return
		}
		w.WriteHeader(200)
	}))
	defer server.Close()
	storage := &fakeStorage{}
	client := newFakeClient()
	worker := New(Config{API: NewAPI(server.URL, "test-internal-token-32-characters"), Storage: storage, ClientFactory: func(*store.Device) Client { return client }})
	client.qr <- whatsmeow.QRChannelItem{Event: whatsmeow.QRChannelEventCode, Code: "opaque-qr-payload"}
	worker.ensureAccount(context.Background(), Account{ID: 12, CompanyID: 5, Status: "connecting"})
	waitFor(t, func() bool { mu.Lock(); defer mu.Unlock(); return status == "qr" })
	jid, _ := types.ParseJID("123456:4@s.whatsapp.net")
	client.emit(&events.PairSuccess{ID: jid})
	client.emit(&events.Connected{})
	waitFor(t, func() bool { mu.Lock(); defer mu.Unlock(); return status == "connected" })
	if storage.mapped.ADString() != jid.ADString() {
		t.Fatalf("device mapping was not persisted: %s", storage.mapped)
	}
	worker.Stop()
}

func TestIncomingGroupMessageIsMappedForAPIAndDedupableID(t *testing.T) {
	var mu sync.Mutex
	var incoming Incoming
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/internal/whatsapp/incoming" {
			_ = json.NewDecoder(r.Body).Decode(&incoming)
			mu.Lock()
			mu.Unlock()
		}
		w.WriteHeader(200)
	}))
	defer server.Close()
	jid, _ := types.ParseJID("12345-678@g.us")
	from, _ := types.ParseJID("628123456789@s.whatsapp.net")
	client := newFakeClient()
	worker := New(Config{API: NewAPI(server.URL, "test-internal-token-32-characters"), Storage: &fakeStorage{}, ClientFactory: func(*store.Device) Client { return client }})
	event := &events.Message{Info: types.MessageInfo{MessageSource: types.MessageSource{Chat: jid, Sender: from, IsGroup: true}, ID: "INBOUND-ID", Timestamp: time.Now(), PushName: "Sender"}, Message: &waE2E.Message{Conversation: proto.String("hello group")}}
	got, ok := worker.toIncoming(context.Background(), 9, client, event)
	if !ok || got.JID != jid.String() || got.SenderJID != from.String() || got.Content != "hello group" || !got.IsGroup {
		t.Fatalf("unexpected inbound mapping: %+v", got)
	}
	worker.enqueue(got)
	worker.Stop()
	mu.Lock()
	defer mu.Unlock()
	if incoming.ExternalID != "INBOUND-ID" || incoming.Content != "hello group" {
		t.Fatalf("API did not receive inbound event: %+v", incoming)
	}
}

func TestOutboundTextAndMediaAreBuiltForWhatsmeow(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/internal/whatsapp/media/key" {
			_, _ = w.Write([]byte("file-data"))
			return
		}
		w.WriteHeader(200)
	}))
	defer server.Close()
	worker := New(Config{API: NewAPI(server.URL, "test-internal-token-32-characters"), Storage: &fakeStorage{}})
	client := newFakeClient()
	target, _ := types.ParseJID("628123456789@s.whatsapp.net")
	text, err := worker.buildOutbound(context.Background(), client, target, "hello", "", "", "")
	if err != nil || text.GetConversation() != "hello" {
		t.Fatalf("text payload: %+v %v", text, err)
	}
	media, err := worker.buildOutbound(context.Background(), client, target, "caption", "key", "image/png", "photo.png")
	if err != nil || media.GetImageMessage() == nil || media.GetImageMessage().GetCaption() != "caption" || media.GetImageMessage().GetDirectPath() != "/path" {
		t.Fatalf("image payload: %+v %v", media, err)
	}
}

func TestRetryLimitAndDeterministicSendID(t *testing.T) {
	if retryOrDead(Job{Attempts: 7}) != "retry" || retryOrDead(Job{Attempts: 8}) != "dead" {
		t.Fatal("outbox retry limit mismatch")
	}
	first := stableMessageID(3, 4)
	if first == "" || stableMessageID(3, 4) != first || stableMessageID(3, 5) == first {
		t.Fatalf("unstable outbox ID %q", first)
	}
}

func TestMediaAndPrivateChatClassification(t *testing.T) {
	if !validChatJID("123@s.whatsapp.net") || !validChatJID("123-456@g.us") || !validChatJID("123@lid") || validChatJID("status@broadcast") {
		t.Fatal("unexpected private/group JID filtering")
	}
	content, media, mimeType, _ := messageContent(&waE2E.Message{ImageMessage: &waE2E.ImageMessage{Caption: proto.String("with image"), Mimetype: proto.String("image/png")}})
	if content != "with image" || media == nil || mimeType != "image/png" {
		t.Fatalf("image message was not recognized: %q %v %q", content, media, mimeType)
	}
}

func waitFor(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(time.Second * 3)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("condition did not become true")
}
