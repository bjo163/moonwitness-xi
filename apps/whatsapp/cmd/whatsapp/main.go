package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"moonwitness/apps/whatsapp/internal/config"
	"moonwitness/apps/whatsapp/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("Invalid WhatsApp service configuration", "error", err)
		os.Exit(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	storage, err := service.OpenStorage(ctx, cfg.DatabaseURL, cfg.Schema, cfg.SessionKey)
	cancel()
	if err != nil {
		slog.Error("Could not initialize WhatsApp PostgreSQL store", "error", err)
		os.Exit(1)
	}
	defer func() {
		if err := storage.Close(); err != nil {
			slog.Error("Close WhatsApp database", "error", err)
		}
	}()
	worker := service.New(service.Config{API: service.NewAPI(cfg.APIURL, cfg.Token), Storage: storage, Port: cfg.Port})
	runCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := worker.Run(runCtx); err != nil {
		slog.Error("WhatsApp service stopped with error", "error", err)
		os.Exit(1)
	}
}
