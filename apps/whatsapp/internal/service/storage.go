package service

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
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

func OpenStorage(ctx context.Context, dsn, schema string) (*Storage, error) {
	if !identifier.MatchString(schema) {
		return nil, fmt.Errorf("invalid WhatsApp SQL schema")
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
	devices, err := sqlstore.New(ctx, "postgres", deviceURL, waLog.Stdout("WhatsAppStore", "WARN", true))
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("initialize whatsmeow PostgreSQL store: %w", err)
	}
	return &Storage{DB: db, Devices: devices, schema: schema}, nil
}

func withSearchPath(dsn, schema string) (string, error) {
	parsed, err := url.Parse(dsn)
	if err != nil {
		return "", fmt.Errorf("parse WhatsApp database URL: %w", err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
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
