package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"kubelens-backend/internal/bootstrap"
	"kubelens-backend/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("invalid configuration: %v", err)
	}

	built, err := bootstrap.Build(cfg)
	if err != nil {
		log.Fatalf("bootstrap failed: %v", err)
	}
	for _, warning := range built.Warnings {
		log.Println(warning)
	}

	log.Printf("KubeLens backend listening on http://localhost:%d", cfg.Port)
	log.Printf("Mode=%s devMode=%t auth=%t writeActions=%t terminal=%t", cfg.Mode, cfg.DevMode, cfg.Auth.Enabled, cfg.WriteActionsEnabled, cfg.Terminal.Enabled)
	log.Printf("Build info: version=%s commit=%s builtAt=%s", cfg.Build.Version, cfg.Build.Commit, cfg.Build.BuiltAt)

	go func() {
		if err := built.Server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server failed: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := built.Server.Shutdown(ctx); err != nil {
		log.Printf("graceful shutdown warning: %v", err)
	}
}
