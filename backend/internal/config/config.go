package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"kubelens-backend/internal/model"
)

type Mode string

const (
	ModeDev  Mode = "dev"
	ModeDemo Mode = "demo"
	ModeProd Mode = "prod"
)

type AuthToken struct {
	Token string
	User  string
	Role  string
}

type Config struct {
	Port    int
	DistDir string
	Build   model.BuildInfo

	Mode    Mode
	DevMode bool

	Cluster ClusterConfig

	Assistant AssistantConfig
	Predictor PredictorConfig
	Memory    MemoryConfig
	ChatOps   ChatOpsConfig
	Auth      AuthConfig
	RateLimit RateLimitConfig
	Audit     AuditConfig
	Alerts    AlertsConfig
	Tracing   TracingConfig

	WriteActionsEnabled  bool
	AnonymousPermissions []string
}

type ClusterConfig struct {
	KubeconfigData string
	Contexts       map[string]string
}

type AssistantConfig struct {
	Provider         string
	Timeout          time.Duration
	APIBaseURL       string
	APIKey           string
	Model            string
	Temperature      float64
	MaxTokens        int
	RAGEnabled       bool
	PromptTimeout    time.Duration
	EmbeddingModel   string
	EmbeddingBaseURL string
	EmbeddingAPIKey  string
}

type PredictorConfig struct {
	BaseURL      string
	Timeout      time.Duration
	SharedSecret string
}

type MemoryConfig struct {
	FilePath string
}

type ChatOpsConfig struct {
	SlackWebhookURL      string
	BaseURL              string
	NotifyIncidents      bool
	NotifyRemediations   bool
	NotifyPostmortems    bool
	NotifyAssistantFinds bool
}

type AuthConfig struct {
	Enabled            bool
	AllowHeaderToken   bool
	TrustedCSRFDomains []string
	Tokens             []AuthToken
	OIDC               AuthOIDCConfig
}

type AuthOIDCConfig struct {
	Enabled       bool
	Provider      string
	IssuerURL     string
	ClientID      string
	UsernameClaim string
	RoleClaim     string
}

type RateLimitConfig struct {
	Enabled  bool
	Requests int
	Window   time.Duration
}

type AuditConfig struct {
	MaxItems int
	FilePath string
}

type AlertsConfig struct {
	Timeout             time.Duration
	AlertmanagerURL     string
	SlackWebhookURL     string
	PagerDutyEventsURL  string
	PagerDutyRoutingKey string
}

type TracingConfig struct {
	Endpoint    string
	Protocol    string
	Insecure    bool
	ServiceName string
	SampleRatio float64
}

type profile struct {
	authEnabled        bool
	rateLimitEnabled   bool
	rateLimitRequests  int
	rateLimitWindowSec int
	writeActions       bool
	ragEnabled         bool
}

func Load() (Config, error) {
	cfg := Config{}
	now := time.Now().UTC()

	mode := parseMode(os.Getenv("APP_MODE"))
	devMode := parseBoolDefault(os.Getenv("DEV_MODE"), false)
	p := profileForMode(mode)

	cfg.Mode = mode
	cfg.DevMode = devMode
	cfg.Port = parsePort(os.Getenv("PORT"))
	cfg.DistDir = strings.TrimSpace(defaultIfEmpty(os.Getenv("DIST_DIR"), "dist"))
	cfg.Cluster = parseClusterConfig()
	cfg.Build = model.BuildInfo{
		Version: defaultIfEmpty(strings.TrimSpace(os.Getenv("APP_VERSION")), "dev"),
		Commit:  defaultIfEmpty(strings.TrimSpace(os.Getenv("APP_COMMIT")), "local"),
		BuiltAt: defaultIfEmpty(strings.TrimSpace(os.Getenv("APP_BUILT_AT")), now.Format(time.RFC3339)),
	}

	embeddingAPIKey := strings.TrimSpace(os.Getenv("ASSISTANT_EMBEDDING_API_KEY"))
	embeddingBaseURL := strings.TrimSpace(firstNonEmpty(
		os.Getenv("OLLAMA_BASE_URL"),
		os.Getenv("ASSISTANT_EMBEDDING_BASE_URL"),
	))
	embeddingModel := strings.TrimSpace(firstNonEmpty(
		os.Getenv("OLLAMA_EMBEDDING_MODEL"),
		os.Getenv("ASSISTANT_EMBEDDING_MODEL"),
	))
	if embeddingBaseURL != "" && embeddingModel == "" {
		embeddingModel = "nomic-embed-text"
	}

	cfg.Assistant = AssistantConfig{
		Provider:         strings.ToLower(strings.TrimSpace(defaultIfEmpty(os.Getenv("ASSISTANT_PROVIDER"), "none"))),
		Timeout:          parseSecondsAsDuration(os.Getenv("ASSISTANT_TIMEOUT_SECONDS"), 8*time.Second),
		APIBaseURL:       strings.TrimSpace(defaultIfEmpty(os.Getenv("ASSISTANT_API_BASE_URL"), "https://api.openai.com/v1")),
		APIKey:           strings.TrimSpace(os.Getenv("ASSISTANT_API_KEY")),
		Model:            strings.TrimSpace(os.Getenv("ASSISTANT_MODEL")),
		Temperature:      parseFloatDefault(os.Getenv("ASSISTANT_TEMPERATURE"), 0.2),
		MaxTokens:        parseIntDefault(os.Getenv("ASSISTANT_MAX_TOKENS"), 700),
		RAGEnabled:       parseBoolDefault(os.Getenv("ASSISTANT_RAG_ENABLED"), p.ragEnabled),
		PromptTimeout:    parseSecondsAsDuration(os.Getenv("ASSISTANT_PROMPT_TIMEOUT_SECONDS"), 8*time.Second),
		EmbeddingModel:   embeddingModel,
		EmbeddingBaseURL: embeddingBaseURL,
		EmbeddingAPIKey:  embeddingAPIKey,
	}

	cfg.Predictor = PredictorConfig{
		BaseURL:      strings.TrimSpace(os.Getenv("PREDICTOR_BASE_URL")),
		Timeout:      parseSecondsAsDuration(os.Getenv("PREDICTOR_TIMEOUT_SECONDS"), 4*time.Second),
		SharedSecret: strings.TrimSpace(os.Getenv("PREDICTOR_SHARED_SECRET")),
	}

	cfg.Memory = MemoryConfig{
		FilePath: strings.TrimSpace(firstNonEmpty(
			os.Getenv("MEMORY_FILE_PATH"),
			"data/memory-runbooks.json",
		)),
	}

	cfg.ChatOps = ChatOpsConfig{
		SlackWebhookURL: strings.TrimSpace(os.Getenv("CHATOPS_SLACK_WEBHOOK_URL")),
		BaseURL: strings.TrimSpace(defaultIfEmpty(
			os.Getenv("CHATOPS_BASE_URL"),
			"http://localhost:5173",
		)),
		NotifyIncidents:      parseBoolDefault(os.Getenv("CHATOPS_NOTIFY_INCIDENTS"), true),
		NotifyRemediations:   parseBoolDefault(os.Getenv("CHATOPS_NOTIFY_REMEDIATIONS"), true),
		NotifyPostmortems:    parseBoolDefault(os.Getenv("CHATOPS_NOTIFY_POSTMORTEMS"), true),
		NotifyAssistantFinds: parseBoolDefault(os.Getenv("CHATOPS_NOTIFY_ASSISTANT_FINDINGS"), false),
	}

	authEnabled := parseBoolDefault(os.Getenv("AUTH_ENABLED"), p.authEnabled)
	tokens := parseAuthTokens(os.Getenv("AUTH_TOKENS"))

	oidcProvider := strings.ToLower(strings.TrimSpace(firstNonEmpty(
		os.Getenv("AUTH_PROVIDER"),
		os.Getenv("AUTH_OIDC_PROVIDER"),
	)))
	oidcIssuer := strings.TrimSpace(os.Getenv("AUTH_OIDC_ISSUER_URL"))
	oidcClientID := strings.TrimSpace(os.Getenv("AUTH_OIDC_CLIENT_ID"))
	oidcUsernameClaim := strings.TrimSpace(os.Getenv("AUTH_OIDC_USERNAME_CLAIM"))
	oidcRoleClaim := strings.TrimSpace(os.Getenv("AUTH_OIDC_ROLE_CLAIM"))
	oidcEnabled := parseBoolDefault(os.Getenv("AUTH_OIDC_ENABLED"), false)
	if oidcProvider != "" || oidcIssuer != "" {
		oidcEnabled = true
	}

	if authEnabled && len(tokens) == 0 {
		if oidcEnabled {
			// OIDC auth does not require static tokens.
		} else if devMode {
			tokens = []AuthToken{
				{Token: "kubelens-viewer", User: "viewer", Role: "viewer"},
				{Token: "kubelens-operator", User: "operator", Role: "operator"},
				{Token: "kubelens-admin", User: "admin", Role: "admin"},
			}
		} else {
			return Config{}, errors.New("AUTH_ENABLED=true requires AUTH_TOKENS unless DEV_MODE=true")
		}
	}
	cfg.Auth = AuthConfig{
		Enabled:            authEnabled,
		AllowHeaderToken:   parseBoolDefault(os.Getenv("AUTH_ALLOW_HEADER_TOKEN"), devMode),
		TrustedCSRFDomains: parseCSV(os.Getenv("AUTH_TRUSTED_CSRF_DOMAINS")),
		Tokens:             tokens,
		OIDC: AuthOIDCConfig{
			Enabled:       oidcEnabled,
			Provider:      oidcProvider,
			IssuerURL:     oidcIssuer,
			ClientID:      oidcClientID,
			UsernameClaim: oidcUsernameClaim,
			RoleClaim:     oidcRoleClaim,
		},
	}

	cfg.RateLimit = RateLimitConfig{
		Enabled:  parseBoolDefault(os.Getenv("RATE_LIMIT_ENABLED"), p.rateLimitEnabled),
		Requests: parseIntDefault(os.Getenv("RATE_LIMIT_REQUESTS"), p.rateLimitRequests),
		Window:   parseSecondsAsDuration(os.Getenv("RATE_LIMIT_WINDOW_SECONDS"), time.Duration(p.rateLimitWindowSec)*time.Second),
	}

	cfg.Audit = AuditConfig{
		MaxItems: parseIntDefault(os.Getenv("AUDIT_MAX_ITEMS"), 500),
		FilePath: strings.TrimSpace(os.Getenv("AUDIT_LOG_FILE")),
	}

	cfg.Alerts = AlertsConfig{
		Timeout:             parseSecondsAsDuration(os.Getenv("ALERT_TIMEOUT_SECONDS"), 5*time.Second),
		AlertmanagerURL:     strings.TrimSpace(os.Getenv("ALERTMANAGER_WEBHOOK_URL")),
		SlackWebhookURL:     strings.TrimSpace(os.Getenv("SLACK_WEBHOOK_URL")),
		PagerDutyEventsURL:  strings.TrimSpace(defaultIfEmpty(os.Getenv("PAGERDUTY_EVENTS_URL"), "https://events.pagerduty.com/v2/enqueue")),
		PagerDutyRoutingKey: strings.TrimSpace(os.Getenv("PAGERDUTY_ROUTING_KEY")),
	}

	tracingEndpoint := firstNonEmpty(
		os.Getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"),
		os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"),
	)
	tracingProtocol := firstNonEmpty(
		os.Getenv("OTEL_EXPORTER_OTLP_TRACES_PROTOCOL"),
		os.Getenv("OTEL_EXPORTER_OTLP_PROTOCOL"),
	)
	tracingInsecure := parseBoolDefault(
		firstNonEmpty(
			os.Getenv("OTEL_EXPORTER_OTLP_TRACES_INSECURE"),
			os.Getenv("OTEL_EXPORTER_OTLP_INSECURE"),
		),
		true,
	)
	tracingService := defaultIfEmpty(strings.TrimSpace(os.Getenv("OTEL_SERVICE_NAME")), "kubelens-backend")
	tracingSample := parseFloatDefault(os.Getenv("OTEL_TRACES_SAMPLE_RATIO"), 1.0)
	if tracingSample < 0 {
		tracingSample = 0
	} else if tracingSample > 1 {
		tracingSample = 1
	}
	cfg.Tracing = TracingConfig{
		Endpoint:    strings.TrimSpace(tracingEndpoint),
		Protocol:    strings.TrimSpace(tracingProtocol),
		Insecure:    tracingInsecure,
		ServiceName: tracingService,
		SampleRatio: tracingSample,
	}

	cfg.WriteActionsEnabled = parseBoolDefault(os.Getenv("WRITE_ACTIONS_ENABLED"), p.writeActions)
	cfg.AnonymousPermissions = anonymousPermissionsFor(cfg)

	if err := validate(cfg); err != nil {
		return Config{}, err
	}

	return cfg, nil
}

func RuntimeStatus(cfg Config, isRealCluster bool, alertsEnabled bool) model.RuntimeStatus {
	warnings := make([]string, 0, 2)
	if cfg.Mode != ModeProd {
		warnings = append(warnings, "Non-production mode: for development/demo use only.")
	}
	if cfg.DevMode {
		warnings = append(warnings, "DEV_MODE enabled: convenience shortcuts may reduce security guarantees.")
	}

	insecure := cfg.Mode != ModeProd || cfg.DevMode || !cfg.Auth.Enabled

	return model.RuntimeStatus{
		Mode:                string(cfg.Mode),
		DevMode:             cfg.DevMode,
		Insecure:            insecure,
		IsRealCluster:       isRealCluster,
		AuthEnabled:         cfg.Auth.Enabled,
		WriteActionsEnabled: cfg.WriteActionsEnabled,
		PredictorEnabled:    strings.TrimSpace(cfg.Predictor.BaseURL) != "",
		PredictorHealthy:    true,
		AssistantEnabled:    cfg.Assistant.Provider != "" && cfg.Assistant.Provider != "none",
		RAGEnabled:          cfg.Assistant.RAGEnabled,
		AlertsEnabled:       alertsEnabled,
		Warnings:            warnings,
	}
}

func validate(cfg Config) error {
	if cfg.Mode == ModeProd && cfg.DevMode {
		return errors.New("DEV_MODE=true is not allowed when APP_MODE=prod")
	}

	if cfg.Mode == ModeProd && !cfg.Auth.Enabled {
		return errors.New("APP_MODE=prod requires AUTH_ENABLED=true")
	}
	if cfg.Mode == ModeProd && cfg.Auth.AllowHeaderToken {
		return errors.New("APP_MODE=prod does not allow AUTH_ALLOW_HEADER_TOKEN=true")
	}
	if cfg.Auth.Enabled && len(cfg.Auth.Tokens) == 0 && !cfg.Auth.OIDC.Enabled {
		return errors.New("AUTH_ENABLED=true requires AUTH_TOKENS or AUTH_OIDC_* configuration")
	}

	if cfg.WriteActionsEnabled && !cfg.Auth.Enabled {
		return errors.New("WRITE_ACTIONS_ENABLED=true requires AUTH_ENABLED=true")
	}

	if cfg.Assistant.Provider != "" && cfg.Assistant.Provider != "none" && cfg.Assistant.Provider != "openai_compatible" {
		return fmt.Errorf("unsupported ASSISTANT_PROVIDER: %s", cfg.Assistant.Provider)
	}

	return nil
}

func parseMode(raw string) Mode {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case string(ModeDev):
		return ModeDev
	case string(ModeProd):
		return ModeProd
	case string(ModeDemo):
		fallthrough
	default:
		return ModeDemo
	}
}

func profileForMode(mode Mode) profile {
	switch mode {
	case ModeDev:
		return profile{
			authEnabled:        false,
			rateLimitEnabled:   true,
			rateLimitRequests:  500,
			rateLimitWindowSec: 60,
			writeActions:       false,
			ragEnabled:         true,
		}
	case ModeProd:
		return profile{
			authEnabled:        true,
			rateLimitEnabled:   true,
			rateLimitRequests:  300,
			rateLimitWindowSec: 60,
			writeActions:       false,
			ragEnabled:         true,
		}
	default:
		return profile{
			authEnabled:        false,
			rateLimitEnabled:   true,
			rateLimitRequests:  300,
			rateLimitWindowSec: 60,
			writeActions:       false,
			ragEnabled:         true,
		}
	}
}

func anonymousPermissionsFor(cfg Config) []string {
	permissions := []string{"read", "assist", "stream"}
	if cfg.WriteActionsEnabled {
		permissions = append(permissions, "write")
	}
	return permissions
}

func parseClusterConfig() ClusterConfig {
	return ClusterConfig{
		KubeconfigData: strings.TrimSpace(os.Getenv("KUBECONFIG_DATA")),
		Contexts:       parseClusterContextMap(strings.TrimSpace(os.Getenv("KUBECONFIG_CONTEXTS"))),
	}
}

func parseClusterContextMap(raw string) map[string]string {
	if raw == "" {
		return map[string]string{}
	}

	entries := strings.Split(raw, ",")
	contexts := make(map[string]string, len(entries))
	for _, entry := range entries {
		item := strings.TrimSpace(entry)
		if item == "" {
			continue
		}
		parts := strings.SplitN(item, ":", 2)
		if len(parts) != 2 {
			continue
		}
		name := strings.TrimSpace(parts[0])
		encoded := strings.TrimSpace(parts[1])
		if name == "" || encoded == "" {
			continue
		}
		contexts[name] = encoded
	}
	return contexts
}

func parsePort(raw string) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || value <= 0 || value > 65535 {
		return 3000
	}
	return value
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

func parseCSV(raw string) []string {
	parts := strings.Split(strings.TrimSpace(raw), ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(strings.ToLower(part))
		if value == "" {
			continue
		}
		out = append(out, value)
	}
	return out
}

func parseAuthTokens(raw string) []AuthToken {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil
	}

	entries := strings.Split(trimmed, ",")
	out := make([]AuthToken, 0, len(entries))
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
		out = append(out, AuthToken{Token: token, User: user, Role: role})
	}
	return out
}

func defaultIfEmpty(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
