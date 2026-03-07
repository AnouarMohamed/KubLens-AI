package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"kubelens-backend/internal/ai"
	"kubelens-backend/internal/cluster"
	"kubelens-backend/internal/httpapi"
)

func main() {
	port := parsePort(getEnv("PORT", "3000"))
	distDir := filepath.Clean(getEnv("DIST_DIR", "dist"))
	kubeconfigData := os.Getenv("KUBECONFIG_DATA")

	clusterSvc, initErr := cluster.NewService(kubeconfigData)
	if initErr != nil {
		log.Printf("cluster initialization warning: %v", initErr)
	}

	aiProvider, aiTimeout, providerErr := buildAIProviderFromEnv()
	if providerErr != nil {
		log.Printf("assistant provider warning: %v", providerErr)
	}
	predictorURL := strings.TrimSpace(os.Getenv("PREDICTOR_BASE_URL"))
	predictorTimeout := parseSecondsAsDuration(os.Getenv("PREDICTOR_TIMEOUT_SECONDS"), 4*time.Second)

	serverHandler := httpapi.New(
		clusterSvc,
		httpapi.WithAIProvider(aiProvider),
		httpapi.WithAITimeout(aiTimeout),
		httpapi.WithPredictor(predictorURL, predictorTimeout),
	)

	server := &http.Server{
		Addr:              ":" + strconv.Itoa(port),
		Handler:           serverHandler.Router(distDir),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	log.Printf("KubeLens Go backend listening on http://localhost:%d (realCluster=%t)", port, clusterSvc.IsRealCluster())
	if aiProvider != nil {
		log.Printf("Assistant provider enabled (%s, timeout=%s)", aiProvider.Name(), aiTimeout)
	} else {
		log.Printf("Assistant provider disabled (deterministic local mode)")
	}
	if predictorURL != "" {
		log.Printf("Predictor service enabled (%s, timeout=%s)", predictorURL, predictorTimeout)
	} else {
		log.Printf("Predictor service disabled (local fallback mode)")
	}

	go func() {
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server failed: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("graceful shutdown warning: %v", err)
	}
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func parsePort(raw string) int {
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 || value > 65535 {
		return 3000
	}
	return value
}

func buildAIProviderFromEnv() (ai.Provider, time.Duration, error) {
	providerKind := strings.ToLower(strings.TrimSpace(os.Getenv("ASSISTANT_PROVIDER")))
	timeout := parseSecondsAsDuration(os.Getenv("ASSISTANT_TIMEOUT_SECONDS"), 8*time.Second)

	if providerKind == "" || providerKind == "none" {
		return nil, timeout, nil
	}

	switch providerKind {
	case "openai_compatible":
		provider, err := ai.NewOpenAICompatibleProvider(ai.OpenAICompatibleConfig{
			BaseURL:     getEnv("ASSISTANT_API_BASE_URL", ""),
			APIKey:      getEnv("ASSISTANT_API_KEY", ""),
			Model:       getEnv("ASSISTANT_MODEL", ""),
			Temperature: parseFloatDefault(os.Getenv("ASSISTANT_TEMPERATURE"), 0.2),
			MaxTokens:   parseIntDefault(os.Getenv("ASSISTANT_MAX_TOKENS"), 700),
		})
		if err != nil {
			return nil, timeout, err
		}
		return provider, timeout, nil
	default:
		return nil, timeout, errors.New("unsupported ASSISTANT_PROVIDER: " + providerKind)
	}
}

func parseSecondsAsDuration(raw string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}
	seconds, err := strconv.Atoi(value)
	if err != nil || seconds <= 0 {
		return fallback
	}
	return time.Duration(seconds) * time.Second
}

func parseFloatDefault(raw string, fallback float64) float64 {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func parseIntDefault(raw string, fallback int) int {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
