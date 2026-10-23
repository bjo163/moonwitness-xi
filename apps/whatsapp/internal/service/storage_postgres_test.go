package service

import (
	"bytes"
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
		t.Skip("set WHATSAPP_TEST_DATABASE_URL to a fresh dedicated PostgreSQL database to run the whatsmeow-store integration")
	}
	// whatsmeow's upstream migration helper checks information_schema by table
	// name only (not schema). An isolated schema in a database already hosting
	// another whatsmeow store is therefore not isolated for the version table.
	// Require a fresh test database so this test never touches the live session.
	probe, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer probe.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := probe.PingContext(ctx); err != nil {
		t.Fatal(err)
	}
	var existingVersionTables int
	if err := probe.QueryRowContext(ctx, `SELECT count(*) FROM information_schema.tables WHERE table_name='whatsmeow_version'`).Scan(&existingVersionTables); err != nil {
		t.Fatal(err)
	}
	if existingVersionTables > 0 {
		t.Skip("WHATSAPP_TEST_DATABASE_URL must point to a fresh PostgreSQL database; whatsmeow migration version detection is not schema-scoped")
	}
	schema := fmt.Sprintf("wa_test_%d", time.Now().UnixNano())
	sessionKey := "postgres-integration-test-session-key-32-bytes"
	storage, err := OpenStorage(ctx, dsn, schema, sessionKey)
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
	var rawNoiseKey []byte
	if err := storage.DB.QueryRowContext(ctx, `SELECT noise_key FROM `+pq.QuoteIdentifier(schema)+`.whatsmeow_device LIMIT 1`).Scan(&rawNoiseKey); err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(rawNoiseKey, []byte(sessionEnvelope)) || bytes.Equal(rawNoiseKey, device.NoiseKey.Priv[:]) {
		t.Fatal("whatsmeow private key was not encrypted in PostgreSQL")
	}
	if err := storage.saveDeviceMapping(ctx, 77, jid); err != nil {
		t.Fatal(err)
	}
	// Simulate an existing plaintext SQLStore row and verify startup migrates it
	// to the encrypted envelope before the worker resumes the saved device.
	if _, err := storage.DB.ExecContext(ctx, `UPDATE `+pq.QuoteIdentifier(schema)+`.whatsmeow_device SET noise_key=$1`, device.NoiseKey.Priv[:]); err != nil {
		t.Fatal(err)
	}
	if err := storage.Close(); err != nil {
		t.Fatal(err)
	}
	storage, err = OpenStorage(ctx, dsn, schema, sessionKey)
	if err != nil {
		t.Fatal(err)
	}
	if err := storage.DB.QueryRowContext(ctx, `SELECT noise_key FROM `+pq.QuoteIdentifier(schema)+`.whatsmeow_device LIMIT 1`).Scan(&rawNoiseKey); err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(rawNoiseKey, []byte(sessionEnvelope)) {
		t.Fatal("legacy plaintext session key was not encrypted during startup migration")
	}
	reloaded, err := storage.device(ctx, 77)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.GetJID().ADString() != jid.ADString() {
		t.Fatalf("reloaded device %s, want %s", reloaded.GetJID(), jid)
	}
	if !bytes.Equal(reloaded.NoiseKey.Priv[:], device.NoiseKey.Priv[:]) {
		t.Fatal("whatsmeow private key did not round-trip through encrypted storage")
	}
	var count int
	if err := storage.DB.QueryRowContext(ctx, `SELECT count(*) FROM information_schema.tables WHERE table_schema=$1 AND table_name LIKE 'whatsmeow_%'`, schema).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count == 0 {
		t.Fatal("whatsmeow SQL store schema was not created")
	}
}
