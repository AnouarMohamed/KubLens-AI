package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5/middleware"

	"kubelens-backend/internal/model"
)

type AuthConfig struct {
	Enabled bool
	Tokens  []AuthToken
}

type AuthToken struct {
	Token string
	User  string
	Role  string
}

type authRole int

const (
	roleViewer authRole = iota + 1
	roleOperator
	roleAdmin
)

type principal struct {
	user string
	role authRole
}

type authRuntime struct {
	enabled bool
	tokens  map[string]principal
}

type principalContextKey struct{}

func WithAuth(config AuthConfig) Option {
	return func(s *Server) {
		s.auth.configure(config)
	}
}

func (a *authRuntime) configure(config AuthConfig) {
	a.enabled = config.Enabled
	a.tokens = make(map[string]principal, len(config.Tokens))

	for _, token := range config.Tokens {
		secret := strings.TrimSpace(token.Token)
		if secret == "" {
			continue
		}

		p := principal{
			user: strings.TrimSpace(token.User),
			role: parseRole(token.Role),
		}
		if p.user == "" {
			p.user = "operator"
		}
		a.tokens[secret] = p
	}
}

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api") {
			next.ServeHTTP(w, r)
			return
		}

		if r.URL.Path == "/api/auth/session" {
			if !s.auth.enabled {
				next.ServeHTTP(w, r.WithContext(withPrincipal(r.Context(), principal{user: "local-admin", role: roleAdmin})))
				return
			}

			if p, err := s.authenticate(r); err == "" {
				next.ServeHTTP(w, r.WithContext(withPrincipal(r.Context(), p)))
				return
			}

			next.ServeHTTP(w, r)
			return
		}

		var (
			p   principal
			err string
		)

		if !s.auth.enabled {
			p = principal{user: "local-admin", role: roleAdmin}
		} else {
			p, err = s.authenticate(r)
			if err != "" {
				s.recordAuthFailure(r, http.StatusUnauthorized, "unauthenticated")
				writeError(w, http.StatusUnauthorized, err)
				return
			}
		}

		required := requiredRole(r.Method, r.URL.Path)
		if p.role < required {
			s.recordAuthFailure(r, http.StatusForbidden, "forbidden")
			writeError(w, http.StatusForbidden, "insufficient role for this action")
			return
		}

		next.ServeHTTP(w, r.WithContext(withPrincipal(r.Context(), p)))
	})
}

func (s *Server) authenticate(r *http.Request) (principal, string) {
	token := strings.TrimSpace(readBearerToken(r.Header.Get("Authorization")))
	if token == "" {
		token = strings.TrimSpace(r.Header.Get("X-Auth-Token"))
	}
	if token == "" && strings.HasPrefix(r.URL.Path, "/api/stream") {
		token = strings.TrimSpace(r.URL.Query().Get("token"))
	}
	if token == "" {
		return principal{}, "missing bearer token"
	}

	p, ok := s.auth.tokens[token]
	if !ok {
		return principal{}, "invalid bearer token"
	}
	return p, ""
}

func readBearerToken(raw string) string {
	parts := strings.Fields(strings.TrimSpace(raw))
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return ""
	}
	return parts[1]
}

func withPrincipal(ctx context.Context, p principal) context.Context {
	return context.WithValue(ctx, principalContextKey{}, p)
}

func principalFromContext(ctx context.Context) (principal, bool) {
	p, ok := ctx.Value(principalContextKey{}).(principal)
	return p, ok
}

func requiredRole(method, path string) authRole {
	cleanMethod := strings.ToUpper(strings.TrimSpace(method))

	switch {
	case cleanMethod == http.MethodPost && path == "/api/assistant":
		return roleViewer
	case cleanMethod == http.MethodPost && path == "/api/terminal/exec":
		return roleAdmin
	case cleanMethod == http.MethodGet || cleanMethod == http.MethodHead:
		return roleViewer
	case cleanMethod == http.MethodPost || cleanMethod == http.MethodPut || cleanMethod == http.MethodPatch || cleanMethod == http.MethodDelete:
		return roleOperator
	default:
		return roleViewer
	}
}

func roleLabel(role authRole) string {
	switch role {
	case roleAdmin:
		return "admin"
	case roleOperator:
		return "operator"
	default:
		return "viewer"
	}
}

func parseRole(role string) authRole {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "admin":
		return roleAdmin
	case "operator":
		return roleOperator
	default:
		return roleViewer
	}
}

func permissionsForRole(role authRole) []string {
	switch role {
	case roleAdmin:
		return []string{"read", "assist", "stream", "write", "terminal"}
	case roleOperator:
		return []string{"read", "assist", "stream", "write"}
	default:
		return []string{"read", "assist", "stream"}
	}
}

func (s *Server) handleAuthSession(w http.ResponseWriter, r *http.Request) {
	session := model.AuthSession{
		Enabled:       s.auth.enabled,
		Authenticated: false,
		Permissions:   nil,
	}

	p, ok := principalFromContext(r.Context())
	if ok {
		session.Authenticated = true
		session.User = &model.SessionUser{
			Name: p.user,
			Role: roleLabel(p.role),
		}
		session.Permissions = permissionsForRole(p.role)
	}

	writeJSON(w, http.StatusOK, session)
}

func (s *Server) recordAuthFailure(r *http.Request, status int, action string) {
	if s.audit == nil {
		return
	}

	s.audit.append(model.AuditEntry{
		Timestamp: s.now().UTC().Format(time.RFC3339),
		RequestID: middleware.GetReqID(r.Context()),
		Method:    r.Method,
		Path:      r.URL.Path,
		Action:    action,
		Status:    status,
		ClientIP:  r.RemoteAddr,
		Success:   false,
	})
}
