package httpapi

import (
	"errors"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"

	"github.com/go-chi/chi/v5/middleware"

	"kubelens-backend/internal/auth"
	"kubelens-backend/internal/model"
)

type AuthConfig = auth.Config

type AuthToken = auth.Token

type authRuntime struct {
	enabled            bool
	trustedCSRFDomains []string
	authenticator      *auth.Authenticator
	cookieName         string
}

func WithAuth(config AuthConfig) Option {
	return func(s *Server) {
		s.auth.configure(config)
	}
}

func (a *authRuntime) configure(config AuthConfig) {
	a.enabled = config.Enabled
	a.trustedCSRFDomains = normalizeDomains(config.TrustedCSRFDomains)
	a.authenticator = auth.NewAuthenticator(config)
	if a.authenticator != nil {
		a.cookieName = a.authenticator.CookieName()
	}
}

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isAPIPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		if r.URL.Path == apiAuthLoginPath || r.URL.Path == apiAuthLogoutPath {
			next.ServeHTTP(w, r)
			return
		}
		if r.URL.Path == apiHealthzPath || r.URL.Path == apiReadyzPath || r.URL.Path == apiOpenAPIPath {
			next.ServeHTTP(w, r)
			return
		}

		if r.URL.Path == apiAuthSessionPath {
			if !s.auth.enabled {
				next.ServeHTTP(w, r)
				return
			}

			if s.auth.authenticator != nil {
				if p, _, err := s.auth.authenticator.AuthenticateRequest(r); err == nil {
					next.ServeHTTP(w, r.WithContext(auth.WithPrincipal(r.Context(), p)))
					return
				}
			}

			next.ServeHTTP(w, r)
			return
		}

		var (
			p       auth.Principal
			channel auth.Channel
			err     error
		)

		if !s.auth.enabled {
			p = auth.Principal{User: "local-viewer", Role: auth.RoleViewer}
		} else {
			if s.auth.authenticator == nil {
				s.recordAuthFailure(r, http.StatusUnauthorized, "unauthenticated")
				writeError(w, http.StatusUnauthorized, "authenticator not configured")
				return
			}
			p, channel, err = s.auth.authenticator.AuthenticateRequest(r)
			if err != nil {
				s.recordAuthFailure(r, http.StatusUnauthorized, "unauthenticated")
				writeError(w, http.StatusUnauthorized, err.Error())
				return
			}
		}

		required := auth.RequiredRole(r.Method, r.URL.Path)
		if p.Role < required {
			s.recordAuthFailure(r, http.StatusForbidden, "forbidden")
			writeError(w, http.StatusForbidden, "insufficient role for this action")
			return
		}
		if required >= auth.RoleOperator && !s.writesOn {
			writeError(w, http.StatusForbidden, "mutating operations are disabled for this environment")
			return
		}
		if isMutatingMethod(r.Method) && channel == auth.ChannelCookie {
			if err := validateCSRFSameOrigin(r, s.auth.trustedCSRFDomains); err != nil {
				s.recordAuthFailure(r, http.StatusForbidden, "csrf_blocked")
				writeError(w, http.StatusForbidden, err.Error())
				return
			}
		}

		next.ServeHTTP(w, r.WithContext(auth.WithPrincipal(r.Context(), p)))
	})
}

type authLoginRequest struct {
	Token string `json:"token"`
}

func (s *Server) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	if !s.auth.enabled {
		writeError(w, http.StatusBadRequest, "auth is disabled")
		return
	}

	var req authLoginRequest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	token := strings.TrimSpace(req.Token)
	if token == "" {
		writeError(w, http.StatusBadRequest, "token is required")
		return
	}

	if s.auth.authenticator == nil {
		writeError(w, http.StatusInternalServerError, "authenticator not configured")
		return
	}
	p, err := s.auth.authenticator.VerifyToken(r.Context(), token)
	if err != nil {
		s.recordAuthFailure(r, http.StatusUnauthorized, "login_failed")
		writeError(w, http.StatusUnauthorized, "invalid bearer token")
		return
	}

	s.writeAuthCookie(w, r, token)
	writeJSON(w, http.StatusOK, model.AuthSession{
		Enabled:       true,
		Authenticated: true,
		User: &model.SessionUser{
			Name: p.User,
			Role: auth.RoleLabel(p.Role),
		},
		Permissions: auth.PermissionsForRole(p.Role),
	})
}

func (s *Server) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	s.clearAuthCookie(w, r)
	writeJSON(w, http.StatusOK, model.AuthSession{
		Enabled:       s.auth.enabled,
		Authenticated: false,
		Permissions:   nil,
	})
}

func (s *Server) writeAuthCookie(w http.ResponseWriter, r *http.Request, token string) {
	if strings.TrimSpace(s.auth.cookieName) == "" {
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     s.auth.cookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   12 * 60 * 60,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   r.TLS != nil,
	})
}

func (s *Server) clearAuthCookie(w http.ResponseWriter, r *http.Request) {
	if strings.TrimSpace(s.auth.cookieName) == "" {
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     s.auth.cookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Secure:   r.TLS != nil,
	})
}

func isMutatingMethod(method string) bool {
	switch strings.ToUpper(strings.TrimSpace(method)) {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

func normalizeDomains(raw []string) []string {
	out := make([]string, 0, len(raw))
	for _, domain := range raw {
		normalized := strings.ToLower(strings.TrimSpace(domain))
		if normalized == "" {
			continue
		}
		if !slices.Contains(out, normalized) {
			out = append(out, normalized)
		}
	}
	return out
}

func validateCSRFSameOrigin(r *http.Request, trustedDomains []string) error {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	referer := strings.TrimSpace(r.Header.Get("Referer"))
	targetHost := strings.ToLower(strings.TrimSpace(r.Host))
	if targetHost == "" {
		return errors.New("host header is required")
	}

	if origin != "" {
		parsed, err := url.Parse(origin)
		if err != nil || parsed.Host == "" {
			return errors.New("invalid request origin")
		}
		if hostAllowed(strings.ToLower(parsed.Host), targetHost, trustedDomains) {
			return nil
		}
		return errors.New("cross-site request blocked")
	}

	if referer != "" {
		parsed, err := url.Parse(referer)
		if err != nil || parsed.Host == "" {
			return errors.New("invalid request referer")
		}
		if hostAllowed(strings.ToLower(parsed.Host), targetHost, trustedDomains) {
			return nil
		}
		return errors.New("cross-site request blocked")
	}

	return errors.New("csrf protection requires origin or referer header")
}

func hostAllowed(candidate, host string, trustedDomains []string) bool {
	if candidate == host {
		return true
	}
	for _, domain := range trustedDomains {
		if candidate == domain {
			return true
		}
	}
	return false
}

func (s *Server) handleAuthSession(w http.ResponseWriter, r *http.Request) {
	session := model.AuthSession{
		Enabled:       s.auth.enabled,
		Authenticated: false,
		Permissions:   nil,
	}
	if !s.auth.enabled {
		session.Permissions = append([]string(nil), s.anonPerms...)
	}

	p, ok := auth.PrincipalFromContext(r.Context())
	if ok {
		session.Authenticated = true
		session.User = &model.SessionUser{
			Name: p.User,
			Role: auth.RoleLabel(p.Role),
		}
		session.Permissions = auth.PermissionsForRole(p.Role)
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
		Path:      sanitizeAuditPath(r.URL.Path),
		Action:    action,
		Status:    status,
		ClientIP:  sanitizeClientIP(r.RemoteAddr),
		Success:   false,
	})
}
