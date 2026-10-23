package config

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

const devToken = "moonwitness-local-whatsapp-internal-token-v1-unsafe"

var schemaPattern = regexp.MustCompile(`^[a-z_][a-z0-9_]{0,62}$`)

type Config struct {
	Environment             string
	APIURL                  string
	Token                   string
	DatabaseURL             string
	DatabaseEncryptedAtRest bool
	Schema                  string
	Port                    int
}

func Load() (Config, error) {
	root, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		return Config{}, err
	}
	_ = godotenv.Load(filepath.Join(root, ".env"))

	environment := strings.TrimSpace(os.Getenv("NODE_ENV"))
	if environment == "" {
		environment = "development"
	}
	apiURL := strings.TrimRight(value("WHATSAPP_API_URL", "http://127.0.0.1:3000"), "/")
	parsedAPI, err := url.ParseRequestURI(apiURL)
	if err != nil || (parsedAPI.Scheme != "http" && parsedAPI.Scheme != "https") || parsedAPI.Host == "" {
		return Config{}, fmt.Errorf("WHATSAPP_API_URL must be an http(s) URL")
	}
	token := strings.TrimSpace(os.Getenv("WHATSAPP_INTERNAL_TOKEN"))
	if token == "" && environment != "production" {
		token = devToken
	}
	if len(token) < 32 {
		return Config{}, fmt.Errorf("WHATSAPP_INTERNAL_TOKEN must contain at least 32 characters")
	}
	databaseURL := strings.TrimSpace(os.Getenv("WHATSAPP_DATABASE_URL"))
	if databaseURL == "" {
		databaseURL = strings.TrimSpace(os.Getenv("DATABASE_URL"))
	}
	if databaseURL == "" {
		return Config{}, fmt.Errorf("WHATSAPP_DATABASE_URL or DATABASE_URL must be set")
	}
	parsedDB, err := url.Parse(databaseURL)
	if err != nil || (parsedDB.Scheme != "postgres" && parsedDB.Scheme != "postgresql") || parsedDB.Host == "" {
		return Config{}, fmt.Errorf("WhatsApp session database must use a PostgreSQL URL")
	}
	encryptedAtRest := strings.EqualFold(strings.TrimSpace(os.Getenv("WHATSAPP_DATABASE_ENCRYPTED_AT_REST")), "true")
	if environment == "production" && !encryptedAtRest {
		return Config{}, fmt.Errorf("WHATSAPP_DATABASE_ENCRYPTED_AT_REST=true is required; whatsmeow stores session keys in PostgreSQL")
	}
	schema := value("WHATSAPP_DATABASE_SCHEMA", "whatsapp_session")
	if !schemaPattern.MatchString(schema) {
		return Config{}, fmt.Errorf("WHATSAPP_DATABASE_SCHEMA must be a valid PostgreSQL schema identifier")
	}
	port, err := strconv.Atoi(value("WHATSAPP_PORT", "3100"))
	if err != nil || port < 1 || port > 65535 {
		return Config{}, fmt.Errorf("WHATSAPP_PORT must be a valid TCP port")
	}
	return Config{Environment: environment, APIURL: apiURL, Token: token, DatabaseURL: databaseURL, DatabaseEncryptedAtRest: encryptedAtRest, Schema: schema, Port: port}, nil
}

func value(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
