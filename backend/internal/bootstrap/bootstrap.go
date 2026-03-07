package bootstrap

import (
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"time"

	"kubelens-backend/internal/ai"
	"kubelens-backend/internal/alerts"
	"kubelens-backend/internal/cluster"
	"kubelens-backend/internal/config"
	"kubelens-backend/internal/httpapi"
	"kubelens-backend/internal/rag"
)

type Result struct {
	Server   *http.Server
	Warnings []string
}

func Build(cfg config.Config) (Result, error) {
	clusterSvc, initErr := cluster.NewService(cfg.Cluster.KubeconfigData)
	warnings := make([]string, 0, 8)
	if initErr != nil {
		warnings = append(warnings, fmt.Sprintf("cluster initialization warning: %v", initErr))
	}

	clusterContexts := map[string]httpapi.ClusterReader{
		"default": clusterSvc,
	}
	for name, payload := range cfg.Cluster.Contexts {
		svc, err := cluster.NewService(payload)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("cluster context %s warning: %v", name, err))
		}
		clusterContexts[name] = svc
	}

	aiProvider, providerErr := buildAIProvider(cfg.Assistant)
	if providerErr != nil {
		warnings = append(warnings, fmt.Sprintf("assistant provider warning: %v", providerErr))
	}

	ragger := rag.NewService(rag.Config{Enabled: cfg.Assistant.RAGEnabled})
	alertDispatcher := alerts.New(alerts.Config{
		AlertmanagerURL:     cfg.Alerts.AlertmanagerURL,
		SlackWebhookURL:     cfg.Alerts.SlackWebhookURL,
		PagerDutyEventsURL:  cfg.Alerts.PagerDutyEventsURL,
		PagerDutyRoutingKey: cfg.Alerts.PagerDutyRoutingKey,
		Timeout:             cfg.Alerts.Timeout,
	})

	runtime := config.RuntimeStatus(cfg, clusterSvc.IsRealCluster(), alertDispatcher.Enabled())

	handler := httpapi.New(
		clusterSvc,
		httpapi.WithAIProvider(aiProvider),
		httpapi.WithAITimeout(cfg.Assistant.Timeout),
		httpapi.WithDocsRetriever(ragger),
		httpapi.WithPredictor(cfg.Predictor.BaseURL, cfg.Predictor.Timeout),
		httpapi.WithAuth(toHTTPAuth(cfg.Auth)),
		httpapi.WithRateLimit(httpapi.RateLimitConfig{
			Enabled:  cfg.RateLimit.Enabled,
			Requests: cfg.RateLimit.Requests,
			Window:   cfg.RateLimit.Window,
		}),
		httpapi.WithTerminalPolicy(httpapi.TerminalPolicy{
			Enabled:            cfg.Terminal.Enabled,
			AllowedPrefixes:    cfg.Terminal.AllowedPrefixes,
			DeniedPrefixes:     cfg.Terminal.DeniedPrefixes,
			KubectlAllowedVerb: cfg.Terminal.KubectlAllowedVerb,
			MaxOutputBytes:     cfg.Terminal.MaxOutputBytes,
		}),
		httpapi.WithAuditConfig(httpapi.AuditConfig{
			MaxItems: cfg.Audit.MaxItems,
			FilePath: cfg.Audit.FilePath,
		}),
		httpapi.WithAlertDispatcher(alertDispatcher),
		httpapi.WithClusterContexts(httpapi.ClusterContextsConfig{
			Default: "default",
			Readers: clusterContexts,
		}),
		httpapi.WithBuildInfo(cfg.Build),
		httpapi.WithRuntimeStatus(runtime),
		httpapi.WithWriteActionsEnabled(cfg.WriteActionsEnabled),
		httpapi.WithAnonymousPermissions(cfg.AnonymousPermissions),
	)

	server := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           handler.Router(filepath.Clean(cfg.DistDir)),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	return Result{
		Server:   server,
		Warnings: warnings,
	}, nil
}

func toHTTPAuth(cfg config.AuthConfig) httpapi.AuthConfig {
	tokens := make([]httpapi.AuthToken, 0, len(cfg.Tokens))
	for _, token := range cfg.Tokens {
		tokens = append(tokens, httpapi.AuthToken{
			Token: token.Token,
			User:  token.User,
			Role:  token.Role,
		})
	}

	return httpapi.AuthConfig{
		Enabled: cfg.Enabled,
		Tokens:  tokens,
	}
}

func buildAIProvider(cfg config.AssistantConfig) (ai.Provider, error) {
	kind := cfg.Provider
	if kind == "" || kind == "none" {
		return nil, nil
	}

	switch kind {
	case "openai_compatible":
		provider, err := ai.NewOpenAICompatibleProvider(ai.OpenAICompatibleConfig{
			BaseURL:     cfg.APIBaseURL,
			APIKey:      cfg.APIKey,
			Model:       cfg.Model,
			Temperature: cfg.Temperature,
			MaxTokens:   cfg.MaxTokens,
		})
		if err != nil {
			return nil, err
		}
		return provider, nil
	default:
		return nil, errors.New("unsupported ASSISTANT_PROVIDER: " + kind)
	}
}
