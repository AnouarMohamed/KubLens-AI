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
	"kubelens-backend/internal/alerts"
	"kubelens-backend/internal/cluster"
	"kubelens-backend/internal/httpapi"
	"kubelens-backend/internal/model"
	"kubelens-backend/internal/rag"
)

func main() {
	port := parsePort(getEnv("PORT", "3000"))
	distDir := filepath.Clean(getEnv("DIST_DIR", "dist"))
	kubeconfigData := os.Getenv("KUBECONFIG_DATA")

	clusterSvc, initErr := cluster.NewService(kubeconfigData)
	if initErr != nil {
		log.Printf("cluster initialization warning: %v", initErr)
	}
	clusterContexts, clusterWarnings := parseClusterContextsFromEnv()
	for _, warning := range clusterWarnings {
		log.Printf("cluster context warning: %s", warning)
	}
	if _, exists := clusterContexts["default"]; !exists {
		clusterContexts["default"] = clusterSvc
	}

	aiProvider, aiTimeout, providerErr := buildAIProviderFromEnv()
	if providerErr != nil {
		log.Printf("assistant provider warning: %v", providerErr)
	}
	ragEnabled := parseBoolDefault(os.Getenv("ASSISTANT_RAG_ENABLED"), true)
	ragSvc := rag.NewService(rag.Config{
		Enabled: ragEnabled,
	})
	authConfig := parseAuthConfigFromEnv()
	rateLimitConfig := parseRateLimitConfigFromEnv()
	terminalPolicy := parseTerminalPolicyFromEnv()
	auditConfig := parseAuditConfigFromEnv()
	alertConfig := parseAlertConfigFromEnv()
	alertDispatcher := alerts.New(alertConfig)
	predictorURL := strings.TrimSpace(os.Getenv("PREDICTOR_BASE_URL"))
	predictorTimeout := parseSecondsAsDuration(os.Getenv("PREDICTOR_TIMEOUT_SECONDS"), 4*time.Second)
	buildInfo := model.BuildInfo{
		Version: getEnv("APP_VERSION", "dev"),
		Commit:  getEnv("APP_COMMIT", "local"),
		BuiltAt: getEnv("APP_BUILT_AT", time.Now().UTC().Format(time.RFC3339)),
	}

	serverHandler := httpapi.New(
		clusterSvc,
		httpapi.WithAIProvider(aiProvider),
		httpapi.WithAITimeout(aiTimeout),
		httpapi.WithDocsRetriever(ragSvc),
		httpapi.WithPredictor(predictorURL, predictorTimeout),
		httpapi.WithAuth(authConfig),
		httpapi.WithRateLimit(rateLimitConfig),
		httpapi.WithTerminalPolicy(terminalPolicy),
		httpapi.WithAuditConfig(auditConfig),
		httpapi.WithAlertDispatcher(alertDispatcher),
		httpapi.WithClusterContexts(httpapi.ClusterContextsConfig{
			Default: "default",
			Readers: clusterContexts,
		}),
		httpapi.WithBuildInfo(buildInfo),
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
	log.Printf("Build info: version=%s commit=%s builtAt=%s", buildInfo.Version, buildInfo.Commit, buildInfo.BuiltAt)
	if aiProvider != nil {
		log.Printf("Assistant provider enabled (%s, timeout=%s)", aiProvider.Name(), aiTimeout)
	} else {
		log.Printf("Assistant provider disabled (deterministic local mode)")
	}
	if ragEnabled {
		log.Printf("Assistant RAG enabled (Kubernetes + Docker docs grounding)")
	} else {
		log.Printf("Assistant RAG disabled")
	}
	if predictorURL != "" {
		log.Printf("Predictor service enabled (%s, timeout=%s)", predictorURL, predictorTimeout)
	} else {
		log.Printf("Predictor service disabled (local fallback mode)")
	}
	if authConfig.Enabled {
		log.Printf("Auth enabled with %d token(s)", len(authConfig.Tokens))
	} else {
		log.Printf("Auth disabled (local trusted mode)")
	}
	if rateLimitConfig.Enabled {
		log.Printf("Rate limit enabled (%d requests per %s)", rateLimitConfig.Requests, rateLimitConfig.Window)
	} else {
		log.Printf("Rate limit disabled")
	}
	if terminalPolicy.Enabled {
		log.Printf("Terminal policy enabled (allowed prefixes: %s)", strings.Join(terminalPolicy.AllowedPrefixes, ", "))
	} else {
		log.Printf("Terminal execution disabled by policy")
	}
	if strings.TrimSpace(auditConfig.FilePath) != "" {
		log.Printf("Audit persistence enabled (%s)", auditConfig.FilePath)
	} else {
		log.Printf("Audit persistence disabled (in-memory only)")
	}
	if alertDispatcher.Enabled() {
		log.Printf("Alert integrations enabled")
	} else {
		log.Printf("Alert integrations disabled")
	}
	log.Printf("Cluster contexts loaded: %d", len(clusterContexts))

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

func parseBoolDefault(raw string, fallback bool) bool {
	value := strings.ToLower(strings.TrimSpace(raw))
	if value == "" {
		return fallback
	}

	switch value {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func parseAuthConfigFromEnv() httpapi.AuthConfig {
	enabled := parseBoolDefault(os.Getenv("AUTH_ENABLED"), false)
	raw := strings.TrimSpace(os.Getenv("AUTH_TOKENS"))
	if !enabled {
		return httpapi.AuthConfig{Enabled: false}
	}

	tokens := parseAuthTokens(raw)
	if len(tokens) == 0 {
		// Deterministic fallback tokens for local development when auth is enabled.
		tokens = []httpapi.AuthToken{
			{Token: "kubelens-viewer", User: "viewer", Role: "viewer"},
			{Token: "kubelens-operator", User: "operator", Role: "operator"},
			{Token: "kubelens-admin", User: "admin", Role: "admin"},
		}
	}

	return httpapi.AuthConfig{
		Enabled: true,
		Tokens:  tokens,
	}
}

func parseAuthTokens(raw string) []httpapi.AuthToken {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}

	entries := strings.Split(raw, ",")
	out := make([]httpapi.AuthToken, 0, len(entries))
	for _, entry := range entries {
		item := strings.TrimSpace(entry)
		if item == "" {
			continue
		}

		parts := strings.Split(item, ":")
		if len(parts) != 3 {
			continue
		}

		user := strings.TrimSpace(parts[0])
		role := strings.TrimSpace(parts[1])
		token := strings.TrimSpace(parts[2])
		if user == "" || role == "" || token == "" {
			continue
		}

		out = append(out, httpapi.AuthToken{
			Token: token,
			User:  user,
			Role:  role,
		})
	}

	return out
}

func parseRateLimitConfigFromEnv() httpapi.RateLimitConfig {
	return httpapi.RateLimitConfig{
		Enabled:  parseBoolDefault(os.Getenv("RATE_LIMIT_ENABLED"), true),
		Requests: parseIntDefault(os.Getenv("RATE_LIMIT_REQUESTS"), 300),
		Window:   parseSecondsAsDuration(os.Getenv("RATE_LIMIT_WINDOW_SECONDS"), time.Minute),
	}
}

func parseTerminalPolicyFromEnv() httpapi.TerminalPolicy {
	allowed := parseCSV(os.Getenv("TERMINAL_ALLOWED_PREFIXES"))
	if len(allowed) == 0 {
		allowed = []string{"kubectl", "helm", "kustomize", "echo", "pwd", "ls", "dir"}
	}
	return httpapi.TerminalPolicy{
		Enabled:         parseBoolDefault(os.Getenv("TERMINAL_ENABLED"), true),
		AllowedPrefixes: allowed,
	}
}

func parseAuditConfigFromEnv() httpapi.AuditConfig {
	return httpapi.AuditConfig{
		MaxItems: parseIntDefault(os.Getenv("AUDIT_MAX_ITEMS"), 500),
		FilePath: strings.TrimSpace(os.Getenv("AUDIT_LOG_FILE")),
	}
}

func parseCSV(raw string) []string {
	parts := strings.Split(strings.TrimSpace(raw), ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value == "" {
			continue
		}
		out = append(out, value)
	}
	return out
}

func parseAlertConfigFromEnv() alerts.Config {
	return alerts.Config{
		AlertmanagerURL:     strings.TrimSpace(os.Getenv("ALERTMANAGER_WEBHOOK_URL")),
		SlackWebhookURL:     strings.TrimSpace(os.Getenv("SLACK_WEBHOOK_URL")),
		PagerDutyEventsURL:  strings.TrimSpace(os.Getenv("PAGERDUTY_EVENTS_URL")),
		PagerDutyRoutingKey: strings.TrimSpace(os.Getenv("PAGERDUTY_ROUTING_KEY")),
		Timeout:             parseSecondsAsDuration(os.Getenv("ALERT_TIMEOUT_SECONDS"), 5*time.Second),
	}
}

func parseClusterContextsFromEnv() (map[string]httpapi.ClusterReader, []string) {
	raw := strings.TrimSpace(os.Getenv("KUBECONFIG_CONTEXTS"))
	if raw == "" {
		return map[string]httpapi.ClusterReader{}, nil
	}

	entries := strings.Split(raw, ",")
	contexts := make(map[string]httpapi.ClusterReader, len(entries))
	warnings := make([]string, 0)

	for _, entry := range entries {
		item := strings.TrimSpace(entry)
		if item == "" {
			continue
		}

		parts := strings.SplitN(item, ":", 2)
		if len(parts) != 2 {
			warnings = append(warnings, "invalid KUBECONFIG_CONTEXTS entry: "+item)
			continue
		}

		name := strings.TrimSpace(parts[0])
		encoded := strings.TrimSpace(parts[1])
		if name == "" || encoded == "" {
			warnings = append(warnings, "invalid KUBECONFIG_CONTEXTS entry: "+item)
			continue
		}

		svc, err := cluster.NewService(encoded)
		if err != nil {
			warnings = append(warnings, "failed to load context "+name+": "+err.Error())
			continue
		}

		contexts[name] = svc
	}

	return contexts, warnings
}
