package service

import (
	"context"
	"database/sql"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/lib/pq"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	waLog "go.mau.fi/whatsmeow/util/log"
)

var identifier = regexp.MustCompile(`^[a-z_][a-z0-9_]{0,62}$`)

type Storage struct {
	DB      *sql.DB
	Devices *sqlstore.Container
	schema  string
}

func OpenStorage(ctx context.Context, dsn, schema, sessionKey string) (*Storage, error) {
	if !identifier.MatchString(schema) {
		return nil, fmt.Errorf("invalid WhatsApp SQL schema")
	}
	sessionCipher, err := newSessionCipher(sessionKey)
	if err != nil {
		return nil, err
	}
	sqlstore.PostgresArrayWrapper = pq.Array
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("open PostgreSQL: %w", err)
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("connect PostgreSQL: %w", err)
	}
	if _, err := db.ExecContext(ctx, `CREATE SCHEMA IF NOT EXISTS `+pq.QuoteIdentifier(schema)); err != nil {
		db.Close()
		return nil, fmt.Errorf("create WhatsApp session schema: %w", err)
	}
	table := pq.QuoteIdentifier(schema) + `.whatsapp_service_devices`
	if _, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS `+table+` (
		account_id BIGINT PRIMARY KEY,
		device_jid TEXT UNIQUE,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`); err != nil {
		db.Close()
		return nil, fmt.Errorf("create WhatsApp device mapping: %w", err)
	}
	deviceURL, err := withSearchPath(dsn, schema)
	if err != nil {
		db.Close()
		return nil, err
	}
	connector, err := pq.NewConnector(deviceURL)
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("configure encrypted whatsmeow PostgreSQL connection: %w", err)
	}
	sessionDB := sql.OpenDB(&encryptedConnector{inner: connector, cipher: sessionCipher})
	sessionDB.SetMaxOpenConns(10)
	sessionDB.SetMaxIdleConns(5)
	sessionDB.SetConnMaxLifetime(30 * time.Minute)
	if err := sessionDB.PingContext(ctx); err != nil {
		sessionDB.Close()
		db.Close()
		return nil, fmt.Errorf("connect encrypted whatsmeow PostgreSQL store: %w", err)
	}
	var actualSearchPath string
	if err := sessionDB.QueryRowContext(ctx, `SHOW search_path`).Scan(&actualSearchPath); err != nil {
		sessionDB.Close()
		db.Close()
		return nil, fmt.Errorf("verify whatsmeow PostgreSQL schema: %w", err)
	}
	if actualSearchPath != schema {
		sessionDB.Close()
		db.Close()
		return nil, fmt.Errorf("whatsmeow PostgreSQL schema mismatch: expected %q, got %q", schema, actualSearchPath)
	}
	devices := sqlstore.NewWithDB(sessionDB, "postgres", waLog.Stdout("WhatsAppStore", "WARN", true))
	if err := devices.Upgrade(ctx); err != nil {
		devices.Close()
		db.Close()
		return nil, fmt.Errorf("initialize whatsmeow PostgreSQL store: %w", err)
	}
	if err := ensureEncryptedColumnConstraints(ctx, db, schema); err != nil {
		devices.Close()
		db.Close()
		return nil, fmt.Errorf("prepare encrypted whatsmeow session columns: %w", err)
	}
	// Read the raw PostgreSQL values here. Reading through sessionDB transparently
	// decrypts them, which would make every startup look like a plaintext migration.
	if err := encryptExistingSessionValues(ctx, db, schema, sessionCipher); err != nil {
		devices.Close()
		db.Close()
		return nil, fmt.Errorf("encrypt existing whatsmeow session values: %w", err)
	}
	return &Storage{DB: db, Devices: devices, schema: schema}, nil
}

type protectedSessionColumn struct {
	table  string
	column string
	length int
}

var protectedSessionColumns = []protectedSessionColumn{
	{table: "whatsmeow_device", column: "noise_key", length: 32},
	{table: "whatsmeow_device", column: "identity_key", length: 32},
	{table: "whatsmeow_device", column: "signed_pre_key", length: 32},
	{table: "whatsmeow_device", column: "signed_pre_key_sig", length: 64},
	{table: "whatsmeow_device", column: "adv_key"},
	{table: "whatsmeow_device", column: "adv_details"},
	{table: "whatsmeow_device", column: "adv_account_sig", length: 64},
	{table: "whatsmeow_device", column: "adv_account_sig_key", length: 32},
	{table: "whatsmeow_device", column: "adv_device_sig", length: 64},
	{table: "whatsmeow_identity_keys", column: "identity", length: 32},
	{table: "whatsmeow_pre_keys", column: "key", length: 32},
	{table: "whatsmeow_sessions", column: "session"},
	{table: "whatsmeow_sender_keys", column: "sender_key"},
	{table: "whatsmeow_app_state_sync_keys", column: "key_data"},
	{table: "whatsmeow_app_state_sync_keys", column: "fingerprint"},
	{table: "whatsmeow_app_state_version", column: "hash", length: 128},
	{table: "whatsmeow_app_state_mutation_macs", column: "value_mac", length: 32},
	{table: "whatsmeow_message_secrets", column: "key"},
	{table: "whatsmeow_privacy_tokens", column: "token"},
	{table: "whatsmeow_nct_salt", column: "salt"},
	{table: "whatsmeow_event_buffer", column: "plaintext"},
	{table: "whatsmeow_retry_buffer", column: "plaintext"},
}

func ensureEncryptedColumnConstraints(ctx context.Context, db *sql.DB, schema string) error {
	for _, item := range protectedSessionColumns {
		if item.length == 0 {
			continue
		}
		constraintName := "mww_enc_" + strings.TrimPrefix(item.table, "whatsmeow_") + "_" + item.column + "_length"
		var exists bool
		if err := db.QueryRowContext(ctx, `SELECT EXISTS (
			SELECT 1 FROM pg_constraint c
			JOIN pg_class t ON t.oid=c.conrelid
			JOIN pg_namespace n ON n.oid=t.relnamespace
			WHERE n.nspname=$1 AND t.relname=$2 AND c.conname=$3
		)`, schema, item.table, constraintName).Scan(&exists); err != nil {
			return err
		}
		if exists {
			continue
		}
		table := pq.QuoteIdentifier(schema) + "." + pq.QuoteIdentifier(item.table)
		legacyConstraint := item.table + "_" + item.column + "_check"
		if _, err := db.ExecContext(ctx, `ALTER TABLE `+table+` DROP CONSTRAINT IF EXISTS `+pq.QuoteIdentifier(legacyConstraint)); err != nil {
			return err
		}
		definition := fmt.Sprintf("CHECK (length(%s) IN (%d, %d))", pq.QuoteIdentifier(item.column), item.length, item.length+sessionEnvelopeOverhead)
		if _, err := db.ExecContext(ctx, `ALTER TABLE `+table+` ADD CONSTRAINT `+pq.QuoteIdentifier(constraintName)+` `+definition); err != nil {
			return err
		}
	}
	return nil
}

func encryptExistingSessionValues(ctx context.Context, db *sql.DB, schema string, cipher *sessionCipher) error {
	for _, item := range protectedSessionColumns {
		table := pq.QuoteIdentifier(schema) + "." + pq.QuoteIdentifier(item.table)
		column := pq.QuoteIdentifier(item.column)
		rows, err := db.QueryContext(ctx, `SELECT ctid::text, `+column+` FROM `+table+` WHERE `+column+` IS NOT NULL`)
		if err != nil {
			return err
		}
		type value struct {
			ctid string
			data []byte
		}
		var pending []value
		for rows.Next() {
			var row value
			if err := rows.Scan(&row.ctid, &row.data); err != nil {
				rows.Close()
				return err
			}
			if !cipher.encrypted(row.data) {
				pending = append(pending, row)
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return err
		}
		if err := rows.Close(); err != nil {
			return err
		}
		for _, row := range pending {
			encrypted, err := cipher.encrypt(row.data)
			if err != nil {
				return err
			}
			if _, err := db.ExecContext(ctx, `UPDATE `+table+` SET `+column+`=$1 WHERE ctid=$2::tid`, encrypted, row.ctid); err != nil {
				return err
			}
		}
	}
	return nil
}

func withSearchPath(dsn, schema string) (string, error) {
	parsed, err := pq.ParseURL(dsn)
	if err != nil {
		return "", fmt.Errorf("parse WhatsApp database URL: %w", err)
	}
	// lib/pq does not reliably pass custom runtime parameters from URL query
	// strings to PostgreSQL. Its keyword DSN form explicitly supports them.
	return parsed + " search_path='" + schema + "'", nil
}

func (s *Storage) Close() error {
	var first error
	if s.Devices != nil {
		first = s.Devices.Close()
	}
	if s.DB != nil {
		if err := s.DB.Close(); first == nil {
			first = err
		}
	}
	return first
}

func (s *Storage) acquire(ctx context.Context, accountID int64) (*sql.Conn, bool, error) {
	conn, err := s.DB.Conn(ctx)
	if err != nil {
		return nil, false, err
	}
	var acquired bool
	if err := conn.QueryRowContext(ctx, `SELECT pg_try_advisory_lock($1)`, advisoryKey(accountID)).Scan(&acquired); err != nil {
		conn.Close()
		return nil, false, err
	}
	if !acquired {
		conn.Close()
		return nil, false, nil
	}
	return conn, true, nil
}

func (s *Storage) release(ctx context.Context, conn *sql.Conn, accountID int64) {
	if conn == nil {
		return
	}
	var ignored bool
	_ = conn.QueryRowContext(ctx, `SELECT pg_advisory_unlock($1)`, advisoryKey(accountID)).Scan(&ignored)
	_ = conn.Close()
}

func advisoryKey(accountID int64) int64 { return accountID ^ int64(0x5748415453415050) }

func (s *Storage) device(ctx context.Context, accountID int64) (*store.Device, error) {
	var deviceJID sql.NullString
	err := s.DB.QueryRowContext(ctx, `SELECT device_jid FROM `+s.table()+` WHERE account_id=$1`, accountID).Scan(&deviceJID)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	if !deviceJID.Valid || strings.TrimSpace(deviceJID.String) == "" {
		return s.Devices.NewDevice(), nil
	}
	jid, err := types.ParseJID(deviceJID.String)
	if err != nil {
		return nil, fmt.Errorf("invalid whatsmeow device mapping for account %d: %w", accountID, err)
	}
	device, err := s.Devices.GetDevice(ctx, jid)
	if err != nil {
		return nil, err
	}
	if device == nil {
		return nil, fmt.Errorf("mapped whatsmeow device %s is missing from session store", jid)
	}
	return device, nil
}

func (s *Storage) saveDeviceMapping(ctx context.Context, accountID int64, jid types.JID) error {
	if jid.IsZero() {
		return fmt.Errorf("cannot save empty WhatsApp device JID")
	}
	_, err := s.DB.ExecContext(ctx, `INSERT INTO `+s.table()+` (account_id, device_jid)
		VALUES ($1,$2) ON CONFLICT (account_id) DO UPDATE SET device_jid=EXCLUDED.device_jid, updated_at=now()`, accountID, jid.ADString())
	return err
}

func (s *Storage) deleteDeviceMapping(ctx context.Context, accountID int64) error {
	_, err := s.DB.ExecContext(ctx, `DELETE FROM `+s.table()+` WHERE account_id=$1`, accountID)
	return err
}

func (s *Storage) table() string { return pq.QuoteIdentifier(s.schema) + `.whatsapp_service_devices` }
