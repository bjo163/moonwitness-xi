package service

import (
	"bytes"
	"database/sql/driver"
	"testing"
)

func TestSessionCipherEncryptsAuthenticatesAndPreservesPlainLegacyValues(t *testing.T) {
	key := "a-valid-test-session-key-at-least-32-bytes"
	cipher, err := newSessionCipher(key)
	if err != nil {
		t.Fatal(err)
	}
	plain := []byte("private WhatsApp session material")
	encrypted, err := cipher.encrypt(plain)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(encrypted, plain) || !cipher.encrypted(encrypted) {
		t.Fatal("session value was not wrapped in an encrypted envelope")
	}
	decrypted, err := cipher.decrypt(encrypted)
	if err != nil || !bytes.Equal(decrypted, plain) {
		t.Fatalf("session value did not round-trip: %v", err)
	}
	if legacy, err := cipher.decrypt([]byte("legacy plaintext")); err != nil || string(legacy) != "legacy plaintext" {
		t.Fatalf("legacy plaintext must be readable during migration: %v", err)
	}
	other, err := newSessionCipher("a-different-valid-session-key-32-bytes-long")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := other.decrypt(encrypted); err == nil {
		t.Fatal("ciphertext unexpectedly decrypted with the wrong key")
	}
	tampered := append([]byte(nil), encrypted...)
	tampered[len(tampered)-1] ^= 1
	if _, err := cipher.decrypt(tampered); err == nil {
		t.Fatal("tampered session ciphertext was accepted")
	}
}

func TestSessionCipherEncryptsSensitiveBytesAndKeepsIndexedKeysStable(t *testing.T) {
	cipher, err := newSessionCipher("a-valid-test-session-key-at-least-32-bytes")
	if err != nil {
		t.Fatal(err)
	}
	args := []driver.NamedValue{
		{Ordinal: 1, Value: "device"},
		{Ordinal: 2, Value: []byte("private key")},
	}
	encoded, err := cipher.encryptArguments(`INSERT INTO whatsmeow_device (jid, noise_key) VALUES ($1, $2)`, args)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := encoded[0].Value.(string); !ok {
		t.Fatal("non-binary JID unexpectedly encrypted")
	}
	if !cipher.encrypted(encoded[1].Value.([]byte)) {
		t.Fatal("sensitive key argument was not encrypted")
	}
	indexed := []driver.NamedValue{{Ordinal: 1, Value: []byte("account")}, {Ordinal: 2, Value: []byte("key id")}, {Ordinal: 3, Value: []byte("key data")}}
	encoded, err = cipher.encryptArguments(`INSERT INTO whatsmeow_app_state_sync_keys (jid, key_id, key_data) VALUES ($1, $2, $3)`, indexed)
	if err != nil {
		t.Fatal(err)
	}
	if cipher.encrypted(encoded[1].Value.([]byte)) || !cipher.encrypted(encoded[2].Value.([]byte)) {
		t.Fatal("app-state lookup key must remain stable while key data is encrypted")
	}
}

func TestSessionCipherRequiresLongKey(t *testing.T) {
	if _, err := newSessionCipher("too short"); err == nil {
		t.Fatal("expected short session key to be rejected")
	}
}
