package service

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/lib/pq"
	waAdv "go.mau.fi/whatsmeow/proto/waAdv"
	"go.mau.fi/whatsmeow/types"
)

func TestPostgresWhatsmeowSessionSchemaSurvivesReload(t *testing.T) {
	dsn := os.Getenv("WHATSAPP_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set WHATSAPP_TEST_DATABASE_URL to run isolated PostgreSQL whatsmeow-store integration")
	}
	schema := fmt.Sprintf("wa_test_%d", time.Now().UnixNano())
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	storage, err := OpenStorage(ctx, dsn, schema)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		_ = storage.Close()
		admin, openErr := sql.Open("postgres", dsn)
		if openErr == nil {
			defer admin.Close()
			_, _ = admin.ExecContext(context.Background(), `DROP SCHEMA IF EXISTS `+pq.QuoteIdentifier(schema)+` CASCADE`)
		}
	}()
	device := storage.Devices.NewDevice()
	// A paired whatsmeow device has an account identity before SQLStore persists it.
	device.Account = &waAdv.ADVSignedDeviceIdentity{
		Details:             []byte{1},
		AccountSignatureKey: make([]byte, 32),
		AccountSignature:    make([]byte, 64),
		DeviceSignature:     make([]byte, 64),
	}
	jid, err := types.ParseJID("123456:4@s.whatsapp.net")
	if err != nil {
		t.Fatal(err)
	}
	device.ID = &jid
	if err := device.Save(ctx); err != nil {
		t.Fatal(err)
	}
	if err := storage.saveDeviceMapping(ctx, 77, jid); err != nil {
		t.Fatal(err)
	}
	reloaded, err := storage.device(ctx, 77)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.GetJID().ADString() != jid.ADString() {
		t.Fatalf("reloaded device %s, want %s", reloaded.GetJID(), jid)
	}
	var count int
	if err := storage.DB.QueryRowContext(ctx, `SELECT count(*) FROM information_schema.tables WHERE table_schema=$1 AND table_name LIKE 'whatsmeow_%'`, schema).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count == 0 {
		t.Fatal("whatsmeow SQL store schema was not created")
	}
}
