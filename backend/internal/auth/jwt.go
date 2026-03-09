package auth

import (
	"context"
	"errors"
	"strings"
	"sync"

	"github.com/coreos/go-oidc/v3/oidc"
)

type OIDCConfig struct {
	Enabled       bool
	Provider      string
	IssuerURL     string
	ClientID      string
	UsernameClaim string
	RoleClaim     string
}

type oidcVerifier struct {
	cfg      OIDCConfig
	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
	once     sync.Once
	err      error
}

func newOIDCVerifier(cfg OIDCConfig) *oidcVerifier {
	return &oidcVerifier{cfg: cfg}
}

func (o *oidcVerifier) verify(ctx context.Context, rawToken string) (Principal, error) {
	if o == nil || !o.cfg.Enabled {
		return Principal{}, errors.New("oidc disabled")
	}

	o.once.Do(func() {
		issuer := resolveIssuer(o.cfg)
		if issuer == "" {
			o.err = errors.New("oidc issuer is required")
			return
		}

		provider, err := oidc.NewProvider(ctx, issuer)
		if err != nil {
			o.err = err
			return
		}

		config := &oidc.Config{}
		if strings.TrimSpace(o.cfg.ClientID) == "" {
			config.SkipClientIDCheck = true
		} else {
			config.ClientID = strings.TrimSpace(o.cfg.ClientID)
		}

		o.provider = provider
		o.verifier = provider.Verifier(config)
	})

	if o.err != nil {
		return Principal{}, o.err
	}
	if o.verifier == nil {
		return Principal{}, errors.New("oidc verifier unavailable")
	}

	idToken, err := o.verifier.Verify(ctx, rawToken)
	if err != nil {
		return Principal{}, err
	}

	claims := map[string]any{}
	if err := idToken.Claims(&claims); err != nil {
		return Principal{}, err
	}

	username := pickUsername(claims, o.cfg.UsernameClaim)
	role := pickRole(claims, o.cfg.RoleClaim)

	return Principal{
		User:     username,
		Role:     role,
		Provider: normalizeProvider(o.cfg.Provider),
		Subject:  idToken.Subject,
		Claims:   claims,
	}, nil
}

func resolveIssuer(cfg OIDCConfig) string {
	if strings.TrimSpace(cfg.IssuerURL) != "" {
		return strings.TrimSpace(cfg.IssuerURL)
	}

	switch normalizeProvider(cfg.Provider) {
	case "google":
		return "https://accounts.google.com"
	case "github":
		return "https://token.actions.githubusercontent.com"
	case "keycloak":
		return ""
	case "oidc":
		return ""
	default:
		return ""
	}
}

func normalizeProvider(raw string) string {
	trimmed := strings.ToLower(strings.TrimSpace(raw))
	if trimmed == "" {
		return "static"
	}
	return trimmed
}

func pickUsername(claims map[string]any, preferred string) string {
	if preferred != "" {
		if value := claimString(claims, preferred); value != "" {
			return value
		}
	}
	if value := claimString(claims, "preferred_username", "email", "name", "sub"); value != "" {
		return value
	}
	return "unknown"
}

func pickRole(claims map[string]any, preferred string) Role {
	if preferred != "" {
		if role := parseRoleClaim(claims[preferred]); role != RoleViewer {
			return role
		}
	}

	if role := parseRoleClaim(claims["roles"]); role != RoleViewer {
		return role
	}
	if role := parseRoleClaim(claims["role"]); role != RoleViewer {
		return role
	}
	if role := parseRoleClaim(claims["groups"]); role != RoleViewer {
		return role
	}

	return RoleViewer
}

func parseRoleClaim(raw any) Role {
	values := claimValues(raw)
	if len(values) == 0 {
		return RoleViewer
	}

	for _, value := range values {
		normalized := strings.ToLower(strings.TrimSpace(value))
		switch normalized {
		case "admin":
			return RoleAdmin
		case "operator":
			return RoleOperator
		case "viewer":
			return RoleViewer
		}
		if strings.Contains(normalized, "admin") {
			return RoleAdmin
		}
		if strings.Contains(normalized, "operator") {
			return RoleOperator
		}
	}

	return RoleViewer
}

func claimString(claims map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := claims[key]; ok {
			if str, ok := value.(string); ok {
				trimmed := strings.TrimSpace(str)
				if trimmed != "" {
					return trimmed
				}
			}
		}
	}
	return ""
}

func claimValues(raw any) []string {
	switch value := raw.(type) {
	case string:
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return nil
		}
		return []string{trimmed}
	case []string:
		out := make([]string, 0, len(value))
		for _, item := range value {
			trimmed := strings.TrimSpace(item)
			if trimmed == "" {
				continue
			}
			out = append(out, trimmed)
		}
		return out
	case []any:
		out := make([]string, 0, len(value))
		for _, item := range value {
			if str, ok := item.(string); ok {
				trimmed := strings.TrimSpace(str)
				if trimmed == "" {
					continue
				}
				out = append(out, trimmed)
			}
		}
		return out
	default:
		return nil
	}
}
