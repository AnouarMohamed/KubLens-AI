package auth

import (
	"context"
	"errors"
	"net/http"
	"strings"
)

type Token struct {
	Token string
	User  string
	Role  string
}

type Config struct {
	Enabled            bool
	AllowHeaderToken   bool
	TrustedCSRFDomains []string
	Tokens             []Token
	CookieName         string
	OIDC               OIDCConfig
}

type Channel int

const (
	ChannelUnknown Channel = iota
	ChannelBearer
	ChannelHeader
	ChannelCookie
)

type Authenticator struct {
	config Config
	tokens map[string]Principal
	oidc   *oidcVerifier
}

func NewAuthenticator(cfg Config) *Authenticator {
	if strings.TrimSpace(cfg.CookieName) == "" {
		cfg.CookieName = "kubelens_auth"
	}
	if cfg.OIDC.Provider != "" || strings.TrimSpace(cfg.OIDC.IssuerURL) != "" {
		cfg.OIDC.Enabled = true
	}

	items := make(map[string]Principal, len(cfg.Tokens))
	for _, token := range cfg.Tokens {
		secret := strings.TrimSpace(token.Token)
		if secret == "" {
			continue
		}

		user := strings.TrimSpace(token.User)
		if user == "" {
			user = "operator"
		}
		items[secret] = Principal{
			User:     user,
			Role:     ParseRole(token.Role),
			Provider: "static",
		}
	}

	return &Authenticator{
		config: cfg,
		tokens: items,
		oidc:   newOIDCVerifier(cfg.OIDC),
	}
}

func (a *Authenticator) CookieName() string {
	if a == nil {
		return ""
	}
	return a.config.CookieName
}

func (a *Authenticator) AuthenticateRequest(r *http.Request) (Principal, Channel, error) {
	if a == nil {
		return Principal{}, ChannelUnknown, errors.New("authenticator not configured")
	}

	token := strings.TrimSpace(readBearerToken(r.Header.Get("Authorization")))
	channel := ChannelBearer
	if token == "" {
		if a.config.AllowHeaderToken {
			token = strings.TrimSpace(r.Header.Get("X-Auth-Token"))
			if token != "" {
				channel = ChannelHeader
			}
		}
	}
	if token == "" {
		if cookie := readAuthCookie(r, a.config.CookieName); cookie != "" {
			token = cookie
			channel = ChannelCookie
		}
	}
	if token == "" {
		return Principal{}, ChannelUnknown, errors.New("missing bearer token")
	}

	principal, err := a.VerifyToken(r.Context(), token)
	if err != nil {
		return Principal{}, channel, err
	}
	return principal, channel, nil
}

func (a *Authenticator) VerifyToken(ctx context.Context, token string) (Principal, error) {
	if a == nil {
		return Principal{}, errors.New("authenticator not configured")
	}
	if principal, ok := a.tokens[token]; ok {
		return principal, nil
	}

	if a.oidc != nil && a.config.OIDC.Enabled {
		principal, err := a.oidc.verify(ctx, token)
		if err != nil {
			return Principal{}, err
		}
		if principal.User == "" {
			principal.User = "oidc-user"
		}
		return principal, nil
	}

	return Principal{}, errors.New("invalid bearer token")
}

func readBearerToken(raw string) string {
	parts := strings.Fields(strings.TrimSpace(raw))
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return ""
	}
	return parts[1]
}

func readAuthCookie(r *http.Request, cookieName string) string {
	if strings.TrimSpace(cookieName) == "" {
		return ""
	}
	cookie, err := r.Cookie(cookieName)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(cookie.Value)
}
