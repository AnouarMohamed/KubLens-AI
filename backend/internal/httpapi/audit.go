package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5/middleware"

	"kubelens-backend/internal/model"
)

const (
	defaultAuditLimit = 120
	maxAuditLimit     = 500
)

type auditLog struct {
	maxItems int
	counter  atomic.Uint64
	mu       sync.RWMutex
	items    []model.AuditEntry
}

func newAuditLog(maxItems int) *auditLog {
	if maxItems <= 0 {
		maxItems = maxAuditLimit
	}
	return &auditLog{
		maxItems: maxItems,
		items:    make([]model.AuditEntry, 0, maxItems),
	}
}

func (l *auditLog) append(entry model.AuditEntry) model.AuditEntry {
	entry.ID = strconv.FormatUint(l.counter.Add(1), 10)
	if strings.TrimSpace(entry.Timestamp) == "" {
		entry.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	l.items = append(l.items, entry)
	if overflow := len(l.items) - l.maxItems; overflow > 0 {
		l.items = append([]model.AuditEntry(nil), l.items[overflow:]...)
	}

	return entry
}

func (l *auditLog) list(limit int) []model.AuditEntry {
	if limit <= 0 {
		limit = defaultAuditLimit
	}
	if limit > maxAuditLimit {
		limit = maxAuditLimit
	}

	l.mu.RLock()
	defer l.mu.RUnlock()

	count := minInt(limit, len(l.items))
	out := make([]model.AuditEntry, 0, count)
	for i := len(l.items) - 1; i >= 0 && len(out) < count; i-- {
		out = append(out, l.items[i])
	}
	return out
}

func (l *auditLog) total() int {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return len(l.items)
}

func (s *Server) auditMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api") {
			next.ServeHTTP(w, r)
			return
		}

		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		start := s.now()
		next.ServeHTTP(ww, r)

		status := ww.Status()
		if status == 0 {
			status = http.StatusOK
		}

		entry := model.AuditEntry{
			Timestamp:  s.now().UTC().Format(time.RFC3339),
			RequestID:  middleware.GetReqID(r.Context()),
			Method:     r.Method,
			Path:       r.URL.Path,
			Route:      routePattern(r),
			Action:     actionForRequest(r.Method, r.URL.Path),
			Status:     status,
			DurationMs: s.now().Sub(start).Milliseconds(),
			Bytes:      int64(ww.BytesWritten()),
			ClientIP:   r.RemoteAddr,
			Success:    status < http.StatusBadRequest,
		}
		if p, ok := principalFromContext(r.Context()); ok {
			entry.User = p.user
			entry.Role = roleLabel(p.role)
		}

		saved := s.audit.append(entry)
		if s.stream != nil {
			s.stream.publish(model.StreamEvent{
				Type:      "audit",
				Timestamp: saved.Timestamp,
				Payload:   saved,
			})
		}
	})
}

func (s *Server) handleAuditLog(w http.ResponseWriter, r *http.Request) {
	limit := parsePositiveInt(r.URL.Query().Get("limit"), defaultAuditLimit)
	items := s.audit.list(limit)
	writeJSON(w, http.StatusOK, model.AuditLogResponse{
		Total: s.audit.total(),
		Items: items,
	})
}

func parsePositiveInt(raw string, fallback int) int {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}
	n, err := strconv.Atoi(value)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
}

func actionForRequest(method, path string) string {
	m := strings.ToUpper(strings.TrimSpace(method))
	switch {
	case m == http.MethodPost && path == "/api/pods":
		return "pod.create"
	case m == http.MethodPost && strings.HasSuffix(path, "/restart") && strings.Contains(path, "/api/pods/"):
		return "pod.restart"
	case m == http.MethodDelete && strings.Contains(path, "/api/pods/"):
		return "pod.delete"
	case m == http.MethodPost && strings.HasSuffix(path, "/cordon"):
		return "node.cordon"
	case m == http.MethodPut && strings.HasSuffix(path, "/yaml"):
		return "resource.apply"
	case m == http.MethodPost && strings.HasSuffix(path, "/scale"):
		return "resource.scale"
	case m == http.MethodPost && strings.HasSuffix(path, "/rollback"):
		return "resource.rollback"
	case m == http.MethodPost && strings.HasSuffix(path, "/restart"):
		return "resource.restart"
	case m == http.MethodPost && path == "/api/assistant":
		return "assistant.ask"
	case m == http.MethodPost && path == "/api/terminal/exec":
		return "terminal.exec"
	default:
		route := strings.TrimSpace(path)
		if route == "" {
			route = "/"
		}
		return strings.ToLower(m) + " " + route
	}
}
