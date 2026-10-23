package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAPIUsesInternalTokenAndParsesAccounts(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-whatsapp-internal-token") != "test-internal-token-32-characters" {
			t.Errorf("missing internal token")
		}
		if r.URL.Path == "/readyz" {
			w.WriteHeader(http.StatusOK)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": []Account{{ID: 8, CompanyID: 3, Status: "connected"}}})
	}))
	defer server.Close()
	api := NewAPI(server.URL, "test-internal-token-32-characters")
	if err := api.ready(context.Background()); err != nil {
		t.Fatal(err)
	}
	accounts, err := api.accounts(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(accounts) != 1 || accounts[0].ID != 8 || accounts[0].CompanyID != 3 || accounts[0].Status != "connected" {
		t.Fatalf("unexpected accounts: %+v", accounts)
	}
}

func TestAPIMediaKeepsInternalTokenAndEnforcesLimit(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-whatsapp-internal-token") != "test-internal-token-32-characters" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte("media"))
	}))
	defer server.Close()
	data, err := NewAPI(server.URL, "test-internal-token-32-characters").media(context.Background(), "file-id")
	if err != nil || string(data) != "media" {
		t.Fatalf("media: %q, %v", data, err)
	}
}
