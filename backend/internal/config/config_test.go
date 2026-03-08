package config

import "testing"

func TestLoadDefaultsDemoMode(t *testing.T) {
	clearConfigEnv(t)

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Mode != ModeDemo {
		t.Fatalf("mode = %s, want %s", cfg.Mode, ModeDemo)
	}
	if cfg.Auth.Enabled {
		t.Fatal("auth should be disabled by default in demo mode")
	}
	if cfg.WriteActionsEnabled {
		t.Fatal("write actions should be disabled by default")
	}
	if cfg.Terminal.Enabled {
		t.Fatal("terminal should be disabled by default")
	}
}

func TestLoadProdRequiresAuth(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("APP_MODE", "prod")
	t.Setenv("AUTH_ENABLED", "false")

	if _, err := Load(); err == nil {
		t.Fatal("expected error when prod mode has auth disabled")
	}
}

func TestLoadAuthTokensRequiredOutsideDevMode(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("AUTH_ENABLED", "true")

	if _, err := Load(); err == nil {
		t.Fatal("expected error when AUTH_ENABLED=true without AUTH_TOKENS")
	}
}

func TestLoadDevModeAllowsFallbackTokens(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("APP_MODE", "dev")
	t.Setenv("DEV_MODE", "true")
	t.Setenv("AUTH_ENABLED", "true")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if len(cfg.Auth.Tokens) != 3 {
		t.Fatalf("fallback tokens = %d, want 3", len(cfg.Auth.Tokens))
	}
}

func TestWriteActionsRequireAuth(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("WRITE_ACTIONS_ENABLED", "true")
	t.Setenv("AUTH_ENABLED", "false")

	if _, err := Load(); err == nil {
		t.Fatal("expected error when write actions enabled without auth")
	}
}

func TestTerminalRequiresAuth(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("TERMINAL_ENABLED", "true")
	t.Setenv("AUTH_ENABLED", "false")

	if _, err := Load(); err == nil {
		t.Fatal("expected error when terminal enabled without auth")
	}
}

func TestProdDisallowsHeaderTokenAuth(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("APP_MODE", "prod")
	t.Setenv("AUTH_ENABLED", "true")
	t.Setenv("AUTH_TOKENS", "admin:admin:secret-token")
	t.Setenv("AUTH_ALLOW_HEADER_TOKEN", "true")

	if _, err := Load(); err == nil {
		t.Fatal("expected error when prod mode enables AUTH_ALLOW_HEADER_TOKEN")
	}
}

func clearConfigEnv(t *testing.T) {
	t.Helper()

	keys := []string{
		"APP_MODE",
		"DEV_MODE",
		"PORT",
		"DIST_DIR",
		"KUBECONFIG_DATA",
		"KUBECONFIG_CONTEXTS",
		"APP_VERSION",
		"APP_COMMIT",
		"APP_BUILT_AT",
		"ASSISTANT_PROVIDER",
		"ASSISTANT_TIMEOUT_SECONDS",
		"ASSISTANT_API_BASE_URL",
		"ASSISTANT_API_KEY",
		"ASSISTANT_MODEL",
		"ASSISTANT_TEMPERATURE",
		"ASSISTANT_MAX_TOKENS",
		"ASSISTANT_RAG_ENABLED",
		"ASSISTANT_PROMPT_TIMEOUT_SECONDS",
		"PREDICTOR_BASE_URL",
		"PREDICTOR_TIMEOUT_SECONDS",
		"AUTH_ENABLED",
		"AUTH_ALLOW_HEADER_TOKEN",
		"AUTH_TRUSTED_CSRF_DOMAINS",
		"AUTH_TOKENS",
		"RATE_LIMIT_ENABLED",
		"RATE_LIMIT_REQUESTS",
		"RATE_LIMIT_WINDOW_SECONDS",
		"TERMINAL_ENABLED",
		"TERMINAL_ALLOWED_PREFIXES",
		"TERMINAL_DENIED_PREFIXES",
		"TERMINAL_KUBECTL_ALLOWED_VERBS",
		"TERMINAL_MAX_OUTPUT_BYTES",
		"AUDIT_MAX_ITEMS",
		"AUDIT_LOG_FILE",
		"ALERT_TIMEOUT_SECONDS",
		"ALERTMANAGER_WEBHOOK_URL",
		"SLACK_WEBHOOK_URL",
		"PAGERDUTY_EVENTS_URL",
		"PAGERDUTY_ROUTING_KEY",
		"WRITE_ACTIONS_ENABLED",
	}
	for _, key := range keys {
		t.Setenv(key, "")
	}
}
