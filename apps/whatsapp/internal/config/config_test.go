package config

import (
	"os"
	"strings"
	"testing"
)

func TestLoadDevelopmentDefaultsAndPostgres(t *testing.T) {
	setConfigEnv(t, map[string]string{"NODE_ENV": "development", "WHATSAPP_INTERNAL_TOKEN": "", "DATABASE_URL": "postgresql://local:pass@127.0.0.1:5432/testdb", "WHATSAPP_DATABASE_URL": "", "WHATSAPP_API_URL": "", "WHATSAPP_DATABASE_SCHEMA": "", "WHATSAPP_PORT": ""})
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Token != devToken || cfg.Port != 3100 || cfg.Schema != "whatsapp_session" {
		t.Fatalf("unexpected development config: %+v", cfg)
	}
	if !strings.Contains(cfg.DatabaseURL, "sslmode=disable") {
		t.Fatalf("expected development localhost PostgreSQL to disable SSL explicitly: %s", cfg.DatabaseURL)
	}
}

func TestLoadPreservesExplicitDatabaseSSLMode(t *testing.T) {
	setConfigEnv(t, map[string]string{"NODE_ENV": "development", "WHATSAPP_INTERNAL_TOKEN": "", "DATABASE_URL": "postgresql://local:pass@127.0.0.1:5432/testdb?sslmode=verify-full", "WHATSAPP_DATABASE_URL": "", "WHATSAPP_API_URL": "", "WHATSAPP_DATABASE_SCHEMA": "", "WHATSAPP_PORT": ""})
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(cfg.DatabaseURL, "sslmode=verify-full") {
		t.Fatalf("explicit PostgreSQL SSL mode must be preserved: %s", cfg.DatabaseURL)
	}
}

func TestLoadProductionRequiresInternalTokenAndDatabaseEncryption(t *testing.T) {
	setConfigEnv(t, map[string]string{"NODE_ENV": "production", "WHATSAPP_INTERNAL_TOKEN": "", "WHATSAPP_DATABASE_ENCRYPTED_AT_REST": "", "DATABASE_URL": "postgres://local:pass@127.0.0.1:5432/testdb", "WHATSAPP_API_URL": "", "WHATSAPP_DATABASE_SCHEMA": "", "WHATSAPP_PORT": ""})
	if _, err := Load(); err == nil {
		t.Fatal("expected production token validation error")
	}
	_ = os.Setenv("WHATSAPP_INTERNAL_TOKEN", "test-internal-token-32-characters")
	if _, err := Load(); err == nil {
		t.Fatal("expected production encryption acknowledgement error")
	}
	_ = os.Setenv("WHATSAPP_DATABASE_ENCRYPTED_AT_REST", "true")
	if _, err := Load(); err != nil {
		t.Fatalf("encrypted production config was rejected: %v", err)
	}
}

func TestLoadRejectsNonPostgresAndInvalidSchema(t *testing.T) {
	setConfigEnv(t, map[string]string{"NODE_ENV": "development", "WHATSAPP_INTERNAL_TOKEN": "", "DATABASE_URL": "sqlite:///tmp/db", "WHATSAPP_API_URL": "", "WHATSAPP_DATABASE_SCHEMA": "", "WHATSAPP_PORT": ""})
	if _, err := Load(); err == nil {
		t.Fatal("expected postgres URL validation error")
	}
	_ = os.Setenv("DATABASE_URL", "postgres://local:pass@127.0.0.1:5432/testdb")
	_ = os.Setenv("WHATSAPP_DATABASE_SCHEMA", "bad-schema")
	if _, err := Load(); err == nil {
		t.Fatal("expected schema validation error")
	}
}

func setConfigEnv(t *testing.T, values map[string]string) {
	t.Helper()
	keys := []string{"NODE_ENV", "WHATSAPP_INTERNAL_TOKEN", "WHATSAPP_DATABASE_ENCRYPTED_AT_REST", "DATABASE_URL", "WHATSAPP_DATABASE_URL", "WHATSAPP_API_URL", "WHATSAPP_DATABASE_SCHEMA", "WHATSAPP_PORT"}
	for _, key := range keys {
		old, ok := os.LookupEnv(key)
		if ok {
			t.Cleanup(func() { _ = os.Setenv(key, old) })
		} else {
			t.Cleanup(func() { _ = os.Unsetenv(key) })
		}
	}
	for _, key := range keys {
		_ = os.Unsetenv(key)
	}
	for key, value := range values {
		_ = os.Setenv(key, value)
	}
}
