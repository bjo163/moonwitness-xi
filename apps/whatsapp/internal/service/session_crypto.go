package service

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
)

const sessionEnvelope = "MWW1"
const sessionEnvelopeOverhead = 4 + 12 + 16

type sessionCipher struct{ aead cipher.AEAD }

func newSessionCipher(secret string) (*sessionCipher, error) {
	if len([]byte(secret)) < 32 {
		return nil, errors.New("WHATSAPP_SESSION_KEY must contain at least 32 bytes")
	}
	key := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(key[:])
	if err != nil {
		return nil, fmt.Errorf("create WhatsApp session cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create WhatsApp session cipher: %w", err)
	}
	return &sessionCipher{aead: aead}, nil
}

func (c *sessionCipher) encrypted(value []byte) bool {
	return len(value) >= len(sessionEnvelope) && string(value[:len(sessionEnvelope)]) == sessionEnvelope
}

func (c *sessionCipher) encrypt(value []byte) ([]byte, error) {
	if value == nil || c.encrypted(value) {
		return value, nil
	}
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("generate WhatsApp session nonce: %w", err)
	}
	result := make([]byte, 0, len(sessionEnvelope)+len(nonce)+len(value)+c.aead.Overhead())
	result = append(result, sessionEnvelope...)
	result = append(result, nonce...)
	result = c.aead.Seal(result, nonce, value, nil)
	return result, nil
}

func (c *sessionCipher) decrypt(value []byte) ([]byte, error) {
	if !c.encrypted(value) {
		return value, nil
	}
	nonceStart := len(sessionEnvelope)
	nonceEnd := nonceStart + c.aead.NonceSize()
	if len(value) < nonceEnd+c.aead.Overhead() {
		return nil, errors.New("invalid WhatsApp session ciphertext envelope")
	}
	plain, err := c.aead.Open(nil, value[nonceStart:nonceEnd], value[nonceEnd:], nil)
	if err != nil {
		return nil, fmt.Errorf("decrypt WhatsApp session value: %w", err)
	}
	return plain, nil
}

var (
	insertValuesPattern = regexp.MustCompile(`(?is)\binsert\s+into\s+[a-z0-9_".]+\s*\(([^)]*)\)\s*values\s*(.*)`)
	rowValuesPattern    = regexp.MustCompile(`\(([^()]*)\)`)
	placeholderPattern  = regexp.MustCompile(`\$([0-9]+)`)
	keyMatchPattern     = regexp.MustCompile(`(?i)\b(key_id|index_mac|ciphertext_hash)\s*=\s*\$([0-9]+)`)
)

// rawKeyParameters identifies bytea values which SQLStore compares or indexes.
// Those identifiers must remain stable; all other byte slices are encrypted.
func rawKeyParameters(query string) map[int]struct{} {
	raw := make(map[int]struct{})
	for _, match := range keyMatchPattern.FindAllStringSubmatch(query, -1) {
		if index, err := strconv.Atoi(match[2]); err == nil {
			raw[index] = struct{}{}
		}
	}
	if match := insertValuesPattern.FindStringSubmatch(query); match != nil {
		columns := strings.Split(match[1], ",")
		for _, tuple := range rowValuesPattern.FindAllStringSubmatch(match[2], -1) {
			values := strings.Split(tuple[1], ",")
			for columnIndex, column := range columns {
				if columnIndex >= len(values) || !isRawKeyColumn(column) {
					continue
				}
				if placeholder := placeholderPattern.FindStringSubmatch(values[columnIndex]); placeholder != nil {
					if index, err := strconv.Atoi(placeholder[1]); err == nil {
						raw[index] = struct{}{}
					}
				}
			}
		}
	}
	return raw
}

func isRawKeyColumn(name string) bool {
	switch strings.ToLower(strings.Trim(strings.TrimSpace(name), `" `)) {
	case "key_id", "index_mac", "ciphertext_hash":
		return true
	default:
		return false
	}
}

func (c *sessionCipher) encryptArguments(query string, args []driver.NamedValue) ([]driver.NamedValue, error) {
	raw := rawKeyParameters(query)
	result := append([]driver.NamedValue(nil), args...)
	for i := range result {
		value, ok := result[i].Value.([]byte)
		if !ok || value == nil {
			continue
		}
		if _, keepRaw := raw[result[i].Ordinal]; keepRaw {
			continue
		}
		encrypted, err := c.encrypt(value)
		if err != nil {
			return nil, err
		}
		result[i].Value = encrypted
	}
	return result, nil
}

type encryptedConnector struct {
	inner  driver.Connector
	cipher *sessionCipher
}

func (c *encryptedConnector) Connect(ctx context.Context) (driver.Conn, error) {
	conn, err := c.inner.Connect(ctx)
	if err != nil {
		return nil, err
	}
	return &encryptedConn{Conn: conn, cipher: c.cipher}, nil
}

func (c *encryptedConnector) Driver() driver.Driver { return c.inner.Driver() }

type encryptedConn struct {
	driver.Conn
	cipher *sessionCipher
}

func (c *encryptedConn) Prepare(query string) (driver.Stmt, error) {
	stmt, err := c.Conn.Prepare(query)
	if err != nil {
		return nil, err
	}
	return &encryptedStmt{Stmt: stmt, query: query, cipher: c.cipher}, nil
}

func (c *encryptedConn) PrepareContext(ctx context.Context, query string) (driver.Stmt, error) {
	if preparer, ok := c.Conn.(driver.ConnPrepareContext); ok {
		stmt, err := preparer.PrepareContext(ctx, query)
		if err != nil {
			return nil, err
		}
		return &encryptedStmt{Stmt: stmt, query: query, cipher: c.cipher}, nil
	}
	return c.Prepare(query)
}

func (c *encryptedConn) Begin() (driver.Tx, error) { return c.Conn.Begin() }

func (c *encryptedConn) BeginTx(ctx context.Context, opts driver.TxOptions) (driver.Tx, error) {
	if beginner, ok := c.Conn.(driver.ConnBeginTx); ok {
		return beginner.BeginTx(ctx, opts)
	}
	if opts != (driver.TxOptions{}) {
		return nil, errors.New("PostgreSQL driver does not support transaction options")
	}
	return c.Conn.Begin()
}

func (c *encryptedConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	values, err := c.cipher.encryptArguments(query, args)
	if err != nil {
		return nil, err
	}
	if execer, ok := c.Conn.(driver.ExecerContext); ok {
		return execer.ExecContext(ctx, query, values)
	}
	stmt, err := c.PrepareContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer stmt.Close()
	return stmt.(driver.StmtExecContext).ExecContext(ctx, values)
}

func (c *encryptedConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	values, err := c.cipher.encryptArguments(query, args)
	if err != nil {
		return nil, err
	}
	if queryer, ok := c.Conn.(driver.QueryerContext); ok {
		rows, err := queryer.QueryContext(ctx, query, values)
		if err != nil {
			return nil, err
		}
		return &encryptedRows{Rows: rows, cipher: c.cipher}, nil
	}
	stmt, err := c.PrepareContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer stmt.Close()
	rows, err := stmt.(driver.StmtQueryContext).QueryContext(ctx, values)
	if err != nil {
		return nil, err
	}
	return &encryptedRows{Rows: rows, cipher: c.cipher}, nil
}

type encryptedStmt struct {
	driver.Stmt
	query  string
	cipher *sessionCipher
}

func (s *encryptedStmt) Exec(args []driver.Value) (driver.Result, error) {
	values := make([]driver.NamedValue, len(args))
	for i, value := range args {
		values[i] = driver.NamedValue{Ordinal: i + 1, Value: value}
	}
	encoded, err := s.cipher.encryptArguments(s.query, values)
	if err != nil {
		return nil, err
	}
	plain := make([]driver.Value, len(encoded))
	for i, value := range encoded {
		plain[i] = value.Value
	}
	return s.Stmt.Exec(plain)
}

func (s *encryptedStmt) Query(args []driver.Value) (driver.Rows, error) {
	values := make([]driver.NamedValue, len(args))
	for i, value := range args {
		values[i] = driver.NamedValue{Ordinal: i + 1, Value: value}
	}
	encoded, err := s.cipher.encryptArguments(s.query, values)
	if err != nil {
		return nil, err
	}
	plain := make([]driver.Value, len(encoded))
	for i, value := range encoded {
		plain[i] = value.Value
	}
	rows, err := s.Stmt.Query(plain)
	if err != nil {
		return nil, err
	}
	return &encryptedRows{Rows: rows, cipher: s.cipher}, nil
}

type encryptedRows struct {
	driver.Rows
	cipher *sessionCipher
}

func (r *encryptedRows) Next(dest []driver.Value) error {
	if err := r.Rows.Next(dest); err != nil {
		return err
	}
	for i, value := range dest {
		bytes, ok := value.([]byte)
		if !ok {
			continue
		}
		plain, err := r.cipher.decrypt(bytes)
		if err != nil {
			return err
		}
		dest[i] = plain
	}
	return nil
}

var _ driver.Connector = (*encryptedConnector)(nil)
var _ driver.Conn = (*encryptedConn)(nil)
var _ driver.ConnBeginTx = (*encryptedConn)(nil)
var _ driver.ConnPrepareContext = (*encryptedConn)(nil)
var _ driver.ExecerContext = (*encryptedConn)(nil)
var _ driver.QueryerContext = (*encryptedConn)(nil)
var _ driver.Stmt = (*encryptedStmt)(nil)
