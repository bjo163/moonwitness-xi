package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type API struct {
	base   string
	token  string
	client *http.Client
}

func NewAPI(base, token string) *API {
	return &API{base: strings.TrimRight(base, "/"), token: token, client: &http.Client{Timeout: 20 * time.Second}}
}

func (a *API) do(ctx context.Context, method, path string, body any, result any) error {
	var requestBody io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		requestBody = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, a.base+path, requestBody)
	if err != nil {
		return err
	}
	req.Header.Set("x-whatsapp-internal-token", a.token)
	if body != nil {
		req.Header.Set("content-type", "application/json")
	}
	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("API %s %s returned %d", method, path, resp.StatusCode)
	}
	if result == nil {
		io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))
		return nil
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 16<<20)).Decode(result); err != nil {
		return fmt.Errorf("decode API %s response: %w", path, err)
	}
	return nil
}

func (a *API) ready(ctx context.Context) error {
	return a.do(ctx, http.MethodGet, "/readyz", nil, nil)
}

func (a *API) accounts(ctx context.Context) ([]Account, error) {
	var response struct {
		Data []Account `json:"data"`
	}
	err := a.do(ctx, http.MethodGet, "/internal/whatsapp/accounts", nil, &response)
	return response.Data, err
}

func (a *API) status(ctx context.Context, accountID int64, patch map[string]any) error {
	patch["account_id"] = accountID
	return a.do(ctx, http.MethodPost, "/internal/whatsapp/status", patch, nil)
}

func (a *API) processEvents(ctx context.Context) error {
	return a.do(ctx, http.MethodPost, "/internal/whatsapp/events/process", map[string]any{}, nil)
}

func (a *API) incoming(ctx context.Context, event Incoming) error {
	return a.do(ctx, http.MethodPost, "/internal/whatsapp/incoming", event, nil)
}

func (a *API) messageStatus(ctx context.Context, accountID int64, externalID, status string) error {
	return a.do(ctx, http.MethodPost, "/internal/whatsapp/message-status", map[string]any{"account_id": accountID, "external_id": externalID, "status": status}, nil)
}

func (a *API) claim(ctx context.Context) (*Job, error) {
	var response struct {
		Data *Job `json:"data"`
	}
	err := a.do(ctx, http.MethodPost, "/internal/whatsapp/jobs/claim", map[string]any{}, &response)
	return response.Data, err
}

func (a *API) heartbeat(ctx context.Context, job Job) error {
	return a.do(ctx, http.MethodPost, "/internal/whatsapp/jobs/heartbeat", map[string]any{"job_id": job.ID, "attempts": job.Attempts}, nil)
}

func (a *API) jobResult(ctx context.Context, result JobResult) error {
	return a.do(ctx, http.MethodPost, "/internal/whatsapp/job-result", result, nil)
}

func (a *API) media(ctx context.Context, key string) ([]byte, error) {
	path := "/internal/whatsapp/media/" + url.PathEscape(key)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.base+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-whatsapp-internal-token", a.token)
	resp, err := a.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("API media returned %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20+1))
	if err != nil {
		return nil, err
	}
	if len(data) == 0 || len(data) > 8<<20 {
		return nil, fmt.Errorf("media exceeds 8 MB limit")
	}
	return data, nil
}

type Account struct {
	ID        int64  `json:"id"`
	CompanyID int64  `json:"company_id"`
	Status    string `json:"status"`
}

type Job struct {
	ID           int64           `json:"id"`
	MessageID    int64           `json:"message_id"`
	AccountID    int64           `json:"account_id"`
	RecipientJID string          `json:"recipient_jid"`
	Payload      json.RawMessage `json:"payload"`
	Attempts     int             `json:"attempts"`
	Message      struct {
		Content string `json:"content"`
	} `json:"message"`
}

type JobResult struct {
	JobID      int64  `json:"job_id"`
	Attempts   int    `json:"attempts"`
	Status     string `json:"status"`
	ExternalID string `json:"external_id,omitempty"`
	Error      string `json:"error,omitempty"`
}

type Incoming struct {
	AccountID     int64  `json:"account_id"`
	JID           string `json:"jid"`
	ExternalID    string `json:"external_id"`
	Name          string `json:"name"`
	IsGroup       bool   `json:"is_group"`
	FromMe        bool   `json:"from_me"`
	Notify        bool   `json:"notify"`
	Timestamp     string `json:"timestamp,omitempty"`
	SenderJID     string `json:"sender_jid,omitempty"`
	Content       string `json:"content"`
	MediaBase64   string `json:"media_base64,omitempty"`
	MediaMIMEType string `json:"media_mime_type,omitempty"`
	MediaFileName string `json:"media_file_name,omitempty"`
}
