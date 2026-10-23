package service

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"go.mau.fi/whatsmeow"
	waE2E "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

type Client interface {
	Connect() error
	Disconnect()
	AddEventHandler(whatsmeow.EventHandler) uint32
	RemoveEventHandler(uint32) bool
	GetQRChannel(context.Context) (<-chan whatsmeow.QRChannelItem, error)
	GenerateMessageID() types.MessageID
	SendMessage(context.Context, types.JID, *waE2E.Message, ...whatsmeow.SendRequestExtra) (whatsmeow.SendResponse, error)
	Upload(context.Context, []byte, whatsmeow.MediaType) (whatsmeow.UploadResponse, error)
	Download(context.Context, whatsmeow.DownloadableMessage) ([]byte, error)
	GetGroupInfo(context.Context, types.JID) (*types.GroupInfo, error)
}

type ClientFactory func(*store.Device) Client

type DeviceStorage interface {
	acquire(context.Context, int64) (*sql.Conn, bool, error)
	release(context.Context, *sql.Conn, int64)
	device(context.Context, int64) (*store.Device, error)
	saveDeviceMapping(context.Context, int64, types.JID) error
	deleteDeviceMapping(context.Context, int64) error
}

type Config struct {
	API           *API
	Storage       DeviceStorage
	Port          int
	ClientFactory ClientFactory
}

type managedAccount struct {
	client              Client
	device              *store.Device
	lock                *sql.Conn
	cancel              context.CancelFunc
	handler             uint32
	requestedDisconnect bool
	backoff             int
	nextConnect         time.Time
}

type Service struct {
	api            *API
	storage        DeviceStorage
	port           int
	factory        ClientFactory
	mu             sync.Mutex
	accounts       map[int64]*managedAccount
	pending        map[string]Incoming
	lastAPISuccess time.Time
	stopping       bool
	root           context.Context
	cancel         context.CancelFunc
	wg             sync.WaitGroup
}

func New(cfg Config) *Service {
	factory := cfg.ClientFactory
	if factory == nil {
		factory = func(device *store.Device) Client {
			client := whatsmeow.NewClient(device, nil)
			client.EnableAutoReconnect = true
			client.InitialAutoReconnect = true
			return client
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &Service{api: cfg.API, storage: cfg.Storage, port: cfg.Port, factory: factory, accounts: map[int64]*managedAccount{}, pending: map[string]Incoming{}, root: ctx, cancel: cancel}
}

func (s *Service) Run(ctx context.Context) error {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		health := s.Health()
		w.Header().Set("content-type", "application/json")
		if !health.OK {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
		_ = json.NewEncoder(w).Encode(health)
	})
	server := &http.Server{Addr: fmt.Sprintf("0.0.0.0:%d", s.port), Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	serverErr := make(chan error, 1)
	go func() { serverErr <- server.ListenAndServe() }()
	s.wg.Add(2)
	go s.incomingLoop()
	go s.loop()
	select {
	case <-ctx.Done():
	case err := <-serverErr:
		if !errors.Is(err, http.ErrServerClosed) {
			s.Stop()
			return err
		}
	}
	s.Stop()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}

type Health struct {
	OK              bool `json:"ok"`
	ActiveAccounts  int  `json:"activeAccounts"`
	PendingIncoming int  `json:"pendingIncoming"`
	PendingSessions int  `json:"pendingSessions"`
}

func (s *Service) Health() Health {
	s.mu.Lock()
	defer s.mu.Unlock()
	return Health{OK: !s.stopping && !s.lastAPISuccess.IsZero() && time.Since(s.lastAPISuccess) < 30*time.Second, ActiveAccounts: len(s.accounts), PendingIncoming: len(s.pending)}
}

func (s *Service) Stop() {
	s.mu.Lock()
	if s.stopping {
		s.mu.Unlock()
		return
	}
	s.stopping = true
	s.cancel()
	accounts := make([]struct {
		id      int64
		managed *managedAccount
	}, 0, len(s.accounts))
	for id, managed := range s.accounts {
		accounts = append(accounts, struct {
			id      int64
			managed *managedAccount
		}{id, managed})
	}
	s.accounts = map[int64]*managedAccount{}
	s.mu.Unlock()
	s.cancel()
	for _, item := range accounts {
		s.stopAccount(item.id, item.managed, false)
	}
	flushCtx, flushCancel := context.WithTimeout(context.Background(), 5*time.Second)
	for {
		s.mu.Lock()
		var key string
		var pending Incoming
		for k, value := range s.pending {
			key, pending = k, value
			break
		}
		s.mu.Unlock()
		if key == "" || flushCtx.Err() != nil {
			break
		}
		if err := s.api.incoming(flushCtx, pending); err == nil {
			s.mu.Lock()
			delete(s.pending, key)
			s.mu.Unlock()
		} else {
			time.Sleep(100 * time.Millisecond)
		}
	}
	flushCancel()
	s.wg.Wait()
}

func (s *Service) loop() {
	defer s.wg.Done()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	waitingLogged := false
	for {
		select {
		case <-s.root.Done():
			return
		case <-ticker.C:
		}
		ctx, cancel := context.WithTimeout(s.root, 20*time.Second)
		if err := s.api.ready(ctx); err != nil {
			if !waitingLogged {
				slog.Warn("WhatsApp is waiting for the API", "error", err)
				waitingLogged = true
			}
			cancel()
			continue
		}
		accounts, err := s.api.accounts(ctx)
		if err != nil {
			cancel()
			continue
		}
		waitingLogged = false
		s.mu.Lock()
		s.lastAPISuccess = time.Now()
		s.mu.Unlock()
		active := make(map[int64]bool, len(accounts))
		for _, account := range accounts {
			if account.ID <= 0 {
				continue
			}
			if account.Status == "disconnected" {
				s.removeAccount(account.ID)
				continue
			}
			if !isActiveStatus(account.Status) {
				continue
			}
			active[account.ID] = true
			s.ensureAccount(ctx, account)
		}
		s.mu.Lock()
		ids := make([]int64, 0, len(s.accounts))
		for id := range s.accounts {
			ids = append(ids, id)
		}
		s.mu.Unlock()
		for _, id := range ids {
			if !active[id] {
				s.removeAccount(id)
			}
		}
		_ = s.api.processEvents(ctx)
		if job, claimErr := s.api.claim(ctx); claimErr == nil && job != nil {
			s.processJob(ctx, *job)
		}
		cancel()
	}
}

func isActiveStatus(status string) bool {
	return status == "connecting" || status == "qr" || status == "connected" || status == "reconnecting"
}

func (s *Service) ensureAccount(ctx context.Context, account Account) {
	s.mu.Lock()
	if current := s.accounts[account.ID]; current != nil {
		if !current.nextConnect.IsZero() && time.Now().Before(current.nextConnect) {
			s.mu.Unlock()
			return
		}
		s.mu.Unlock()
		return
	}
	s.mu.Unlock()
	lock, acquired, err := s.storage.acquire(ctx, account.ID)
	if err != nil {
		slog.Error("Could not acquire WhatsApp device lease", "account_id", account.ID, "error", err)
		return
	}
	if !acquired {
		_ = s.api.status(ctx, account.ID, map[string]any{"status": "error", "last_error": "WhatsApp device is already owned by another worker"})
		return
	}
	device, err := s.storage.device(ctx, account.ID)
	if err != nil {
		s.storage.release(ctx, lock, account.ID)
		_ = s.api.status(ctx, account.ID, map[string]any{"status": "error", "last_error": "Could not load whatsmeow session; check PostgreSQL session storage"})
		return
	}
	client := s.factory(device)
	clientCtx, cancel := context.WithCancel(s.root)
	managed := &managedAccount{client: client, device: device, lock: lock, cancel: cancel}
	s.mu.Lock()
	if current := s.accounts[account.ID]; current != nil {
		s.mu.Unlock()
		cancel()
		s.storage.release(context.Background(), lock, account.ID)
		return
	}
	s.accounts[account.ID] = managed
	s.mu.Unlock()
	managed.handler = client.AddEventHandler(func(event any) { s.handleEvent(account.ID, managed, event) })
	var qr <-chan whatsmeow.QRChannelItem
	if device.ID == nil {
		var qrErr error
		qr, qrErr = client.GetQRChannel(clientCtx)
		if qrErr != nil {
			s.failAccount(ctx, account.ID, managed, "Could not start WhatsApp QR pairing", qrErr)
			return
		}
	}
	_ = s.api.status(ctx, account.ID, map[string]any{"status": "connecting", "qr_code": nil, "last_error": nil})
	if device.ID == nil {
		s.wg.Add(1)
		go s.readQR(clientCtx, account.ID, managed, qr)
	}
	if err := client.Connect(); err != nil {
		s.failAccount(ctx, account.ID, managed, "Could not connect to WhatsApp", err)
	}
}

func (s *Service) readQR(ctx context.Context, accountID int64, managed *managedAccount, qr <-chan whatsmeow.QRChannelItem) {
	defer s.wg.Done()
	for {
		select {
		case <-ctx.Done():
			return
		case item, ok := <-qr:
			if !ok {
				return
			}
			if item.Event == whatsmeow.QRChannelEventCode {
				call, cancel := context.WithTimeout(ctx, 5*time.Second)
				_ = s.api.status(call, accountID, map[string]any{"status": "qr", "qr_code": item.Code, "last_error": nil})
				cancel()
			} else if item.Error != nil {
				slog.Warn("WhatsApp QR pairing failed", "account_id", accountID, "error", item.Error)
				call, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				_ = s.api.status(call, accountID, map[string]any{"status": "error", "qr_code": nil, "last_error": "WhatsApp QR pairing failed"})
				cancel()
				s.removeAccount(accountID)
				return
			} else if item.Event == "timeout" {
				call, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				_ = s.api.status(call, accountID, map[string]any{"status": "error", "qr_code": nil, "last_error": "WhatsApp QR expired; connect again to request a new code"})
				cancel()
				s.removeAccount(accountID)
				return
			}
		}
	}
}

func (s *Service) handleEvent(accountID int64, managed *managedAccount, event any) {
	ctx, cancel := context.WithTimeout(s.root, 15*time.Second)
	defer cancel()
	switch evt := event.(type) {
	case *events.PairSuccess:
		if err := s.storage.saveDeviceMapping(ctx, accountID, evt.ID); err != nil {
			slog.Error("Could not save paired WhatsApp device", "account_id", accountID, "error", err)
		}
	case *events.Connected:
		jid := managed.device.GetJID()
		if jid.IsZero() {
			return
		}
		_ = s.storage.saveDeviceMapping(ctx, accountID, jid)
		phone := strings.Split(jid.User, ":")[0]
		_ = s.api.status(ctx, accountID, map[string]any{"status": "connected", "qr_code": nil, "phone_number": phone, "last_error": nil, "auth_state": nil})
	case *events.Disconnected:
		_ = s.api.status(ctx, accountID, map[string]any{"status": "reconnecting", "qr_code": nil, "last_error": nil})
	case *events.LoggedOut:
		_ = managed.device.Delete(ctx)
		_ = s.storage.deleteDeviceMapping(ctx, accountID)
		_ = s.api.status(ctx, accountID, map[string]any{"status": "error", "qr_code": nil, "auth_state": nil, "last_error": "WhatsApp device was logged out; connect again to scan a new QR code"})
		s.removeAccount(accountID)
	case *events.Message:
		if incoming, ok := s.toIncoming(ctx, accountID, managed.client, evt); ok {
			s.enqueue(incoming)
		}
	case *events.Receipt:
		status := ""
		switch evt.Type {
		case types.ReceiptTypeRead, types.ReceiptTypeReadSelf, types.ReceiptTypePlayed, types.ReceiptTypePlayedSelf:
			status = "read"
		case types.ReceiptTypeDelivered:
			status = "delivered"
		}
		if status != "" {
			for _, id := range evt.MessageIDs {
				_ = s.api.messageStatus(ctx, accountID, string(id), status)
			}
		}
	}
}

func (s *Service) toIncoming(ctx context.Context, accountID int64, client Client, evt *events.Message) (Incoming, bool) {
	if evt == nil || evt.Message == nil || evt.Info.ID == "" {
		return Incoming{}, false
	}
	jid := evt.Info.Chat.String()
	if !validChatJID(jid) {
		return Incoming{}, false
	}
	content, downloadable, mimeType, filename := messageContent(evt.Message)
	if content == "" && downloadable == nil {
		return Incoming{}, false
	}
	if downloadable != nil {
		if sized, ok := downloadable.(interface{ GetFileLength() uint64 }); ok && sized.GetFileLength() > 8<<20 {
			content = "[Attachment exceeds 8 MB]"
			downloadable = nil
		}
	}
	incoming := Incoming{AccountID: accountID, JID: jid, ExternalID: string(evt.Info.ID), Name: evt.Info.PushName, IsGroup: evt.Info.IsGroup, FromMe: evt.Info.IsFromMe, Notify: true, Timestamp: evt.Info.Timestamp.UTC().Format(time.RFC3339Nano), SenderJID: evt.Info.Sender.String(), Content: content}
	if evt.Info.IsGroup {
		if info, err := client.GetGroupInfo(ctx, evt.Info.Chat); err == nil && info.Name != "" {
			incoming.Name = info.Name
		}
	} else if incoming.Name == "" {
		incoming.Name = jid
	}
	if downloadable != nil {
		data, err := client.Download(ctx, downloadable)
		if err != nil || len(data) == 0 || len(data) > 8<<20 {
			incoming.Content = firstNonEmpty(content, "[Attachment could not be downloaded or exceeds 8 MB]")
		} else {
			incoming.MediaBase64 = base64.StdEncoding.EncodeToString(data)
			incoming.MediaMIMEType = mimeType
			incoming.MediaFileName = filename
		}
	}
	return incoming, true
}

func messageContent(message *waE2E.Message) (string, whatsmeow.DownloadableMessage, string, string) {
	text := message.GetConversation()
	if text == "" {
		text = message.GetExtendedTextMessage().GetText()
	}
	if image := message.GetImageMessage(); image != nil {
		return firstNonEmpty(text, image.GetCaption()), image, image.GetMimetype(), ""
	}
	if video := message.GetVideoMessage(); video != nil {
		return firstNonEmpty(text, video.GetCaption()), video, video.GetMimetype(), ""
	}
	if audio := message.GetAudioMessage(); audio != nil {
		return text, audio, audio.GetMimetype(), "audio"
	}
	if document := message.GetDocumentMessage(); document != nil {
		return firstNonEmpty(text, document.GetCaption()), document, document.GetMimetype(), document.GetFileName()
	}
	if sticker := message.GetStickerMessage(); sticker != nil {
		return text, sticker, sticker.GetMimetype(), "sticker.webp"
	}
	return text, nil, "", ""
}

func (s *Service) enqueue(event Incoming) {
	key := fmt.Sprintf("%d:%s", event.AccountID, event.ExternalID)
	s.mu.Lock()
	s.pending[key] = event
	s.mu.Unlock()
}

func (s *Service) incomingLoop() {
	defer s.wg.Done()
	ticker := time.NewTicker(300 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-s.root.Done():
			return
		case <-ticker.C:
		}
		s.mu.Lock()
		var key string
		var item Incoming
		for k, v := range s.pending {
			key, item = k, v
			break
		}
		s.mu.Unlock()
		if key == "" {
			continue
		}
		ctx, cancel := context.WithTimeout(s.root, 15*time.Second)
		err := s.api.incoming(ctx, item)
		cancel()
		if err == nil {
			s.mu.Lock()
			delete(s.pending, key)
			s.mu.Unlock()
		}
	}
}

func (s *Service) processJob(ctx context.Context, job Job) {
	jobCtx, cancelJob := context.WithTimeout(s.root, 2*time.Minute)
	defer cancelJob()
	managed := s.account(job.AccountID)
	result := JobResult{JobID: job.ID, Attempts: job.Attempts, Status: "done"}
	if managed == nil {
		result.Status = retryOrDead(job)
		result.Error = "WhatsApp connection is not ready"
		_ = s.api.jobResult(jobCtx, result)
		return
	}
	heartbeatDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-heartbeatDone:
				return
			case <-jobCtx.Done():
				return
			case <-ticker.C:
				_ = s.api.heartbeat(jobCtx, job)
			}
		}
	}()
	defer close(heartbeatDone)
	payload, err := parseOutboundPayload(job.Payload)
	if err != nil {
		result.Status = retryOrDead(job)
		result.Error = "Invalid queued WhatsApp message"
		_ = s.api.jobResult(jobCtx, result)
		return
	}
	if payload.Content == "" {
		payload.Content = job.Message.Content
	}
	target, err := types.ParseJID(job.RecipientJID)
	var message *waE2E.Message
	if err == nil {
		message, err = s.buildOutbound(jobCtx, managed.client, target, payload.Content, payload.MediaKey, payload.MediaMIMEType, payload.MediaFileName)
	}
	if err == nil {
		sent, sendErr := managed.client.SendMessage(jobCtx, target, message, whatsmeow.SendRequestExtra{ID: stableMessageID(job.AccountID, job.ID)})
		err = sendErr
		if sendErr == nil {
			result.ExternalID = string(sent.ID)
		}
	}
	if err != nil {
		result.Status = retryOrDead(job)
		result.Error = truncate(err.Error(), 255)
	}
	_ = s.api.jobResult(jobCtx, result)
}

type outboundPayload struct {
	Content       string `json:"content"`
	MediaKey      string `json:"media_key"`
	MediaMIMEType string `json:"media_mime_type"`
	MediaFileName string `json:"media_file_name"`
}

func parseOutboundPayload(raw json.RawMessage) (outboundPayload, error) {
	var payload outboundPayload
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return payload, nil
	}
	if strings.HasPrefix(trimmed, `"`) {
		var encoded string
		if err := json.Unmarshal(raw, &encoded); err != nil {
			return payload, err
		}
		raw = json.RawMessage(encoded)
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return payload, err
	}
	return payload, nil
}

func (s *Service) buildOutbound(ctx context.Context, client Client, target types.JID, text, mediaKey, mimeType, filename string) (*waE2E.Message, error) {
	if mediaKey == "" {
		if strings.TrimSpace(text) == "" {
			return nil, fmt.Errorf("message text is empty")
		}
		return &waE2E.Message{Conversation: proto.String(text)}, nil
	}
	data, err := s.api.media(ctx, mediaKey)
	if err != nil {
		return nil, err
	}
	mimeType = strings.ToLower(strings.TrimSpace(mimeType))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	uploadType, field := whatsmeow.MediaDocument, "document"
	switch {
	case strings.HasPrefix(mimeType, "image/"):
		uploadType, field = whatsmeow.MediaImage, "image"
	case strings.HasPrefix(mimeType, "video/"):
		uploadType, field = whatsmeow.MediaVideo, "video"
	case strings.HasPrefix(mimeType, "audio/"):
		uploadType, field = whatsmeow.MediaAudio, "audio"
	}
	upload, err := client.Upload(ctx, data, uploadType)
	if err != nil {
		return nil, err
	}
	switch field {
	case "image":
		return &waE2E.Message{ImageMessage: &waE2E.ImageMessage{URL: &upload.URL, DirectPath: &upload.DirectPath, MediaKey: upload.MediaKey, FileEncSHA256: upload.FileEncSHA256, FileSHA256: upload.FileSHA256, FileLength: &upload.FileLength, Mimetype: proto.String(mimeType), Caption: optionalText(text)}}, nil
	case "video":
		return &waE2E.Message{VideoMessage: &waE2E.VideoMessage{URL: &upload.URL, DirectPath: &upload.DirectPath, MediaKey: upload.MediaKey, FileEncSHA256: upload.FileEncSHA256, FileSHA256: upload.FileSHA256, FileLength: &upload.FileLength, Mimetype: proto.String(mimeType), Caption: optionalText(text)}}, nil
	case "audio":
		return &waE2E.Message{AudioMessage: &waE2E.AudioMessage{URL: &upload.URL, DirectPath: &upload.DirectPath, MediaKey: upload.MediaKey, FileEncSHA256: upload.FileEncSHA256, FileSHA256: upload.FileSHA256, FileLength: &upload.FileLength, Mimetype: proto.String(mimeType), PTT: proto.Bool(false)}}, nil
	default:
		if filename == "" {
			filename = "attachment"
		}
		return &waE2E.Message{DocumentMessage: &waE2E.DocumentMessage{URL: &upload.URL, DirectPath: &upload.DirectPath, MediaKey: upload.MediaKey, FileEncSHA256: upload.FileEncSHA256, FileSHA256: upload.FileSHA256, FileLength: &upload.FileLength, Mimetype: proto.String(mimeType), FileName: proto.String(filename), Caption: optionalText(text)}}, nil
	}
}

func (s *Service) account(accountID int64) *managedAccount {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.accounts[accountID]
}

func (s *Service) removeAccount(accountID int64) {
	s.mu.Lock()
	managed := s.accounts[accountID]
	delete(s.accounts, accountID)
	s.mu.Unlock()
	if managed != nil {
		s.stopAccount(accountID, managed, true)
	}
}

func (s *Service) stopAccount(accountID int64, managed *managedAccount, release bool) {
	managed.cancel()
	managed.client.RemoveEventHandler(managed.handler)
	managed.client.Disconnect()
	if release {
		s.storage.release(context.Background(), managed.lock, accountID)
	}
}

func (s *Service) failAccount(ctx context.Context, accountID int64, managed *managedAccount, message string, err error) {
	slog.Error(message, "account_id", accountID, "error", err)
	_ = s.api.status(ctx, accountID, map[string]any{"status": "error", "qr_code": nil, "last_error": message})
	s.removeAccount(accountID)
}

func retryOrDead(job Job) string {
	if job.Attempts >= 8 {
		return "dead"
	}
	return "retry"
}
func optionalText(value string) *string {
	if value == "" {
		return nil
	}
	return proto.String(value)
}
func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
func truncate(value string, max int) string {
	if len(value) > max {
		return value[:max]
	}
	return value
}
func validChatJID(jid string) bool {
	return len(jid) > 0 && (strings.HasSuffix(jid, "@s.whatsapp.net") || strings.HasSuffix(jid, "@g.us") || strings.HasSuffix(jid, "@lid"))
}
func stableMessageID(accountID, jobID int64) types.MessageID {
	sum := sha256.Sum256([]byte(fmt.Sprintf("%d:%d", accountID, jobID)))
	return types.MessageID("MW" + strings.ToUpper(hex.EncodeToString(sum[:9])))
}
