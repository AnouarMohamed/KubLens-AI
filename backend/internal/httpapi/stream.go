package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5/middleware"

	"kubelens-backend/internal/model"
)

const streamBufferSize = 32

type streamHub struct {
	mu     sync.RWMutex
	nextID int
	subs   map[int]chan model.StreamEvent
}

func newStreamHub() *streamHub {
	return &streamHub{
		subs: make(map[int]chan model.StreamEvent),
	}
}

func (h *streamHub) subscribe() (int, <-chan model.StreamEvent) {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.nextID++
	id := h.nextID
	ch := make(chan model.StreamEvent, streamBufferSize)
	h.subs[id] = ch
	return id, ch
}

func (h *streamHub) unsubscribe(id int) {
	h.mu.Lock()
	defer h.mu.Unlock()

	ch, ok := h.subs[id]
	if !ok {
		return
	}
	delete(h.subs, id)
	close(ch)
}

func (h *streamHub) publish(event model.StreamEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, ch := range h.subs {
		select {
		case ch <- event:
		default:
			// Drop when subscriber is slower than producer to avoid blocking request paths.
		}
	}
}

func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming is not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	subID, events := s.stream.subscribe()
	defer s.stream.unsubscribe(subID)

	_ = writeSSE(w, "connected", model.StreamEvent{
		Type:      "connected",
		Timestamp: s.now().UTC().Format(time.RFC3339),
		Payload: map[string]string{
			"message": "stream established",
		},
	})
	flusher.Flush()

	ticker := time.NewTicker(8 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case event, ok := <-events:
			if !ok {
				return
			}
			if err := writeSSE(w, event.Type, event); err != nil {
				return
			}
			flusher.Flush()
		case <-ticker.C:
			stats := s.currentClusterStats(r.Context())
			if err := writeSSE(w, "stats", model.StreamEvent{
				Type:      "stats",
				Timestamp: s.now().UTC().Format(time.RFC3339),
				Payload:   stats,
			}); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func writeSSE(w http.ResponseWriter, event string, payload any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	if _, err := w.Write([]byte("event: " + sanitizeSSEField(event) + "\n")); err != nil {
		return err
	}
	if _, err := w.Write([]byte("data: " + string(encoded) + "\n\n")); err != nil {
		return err
	}
	return nil
}

func sanitizeSSEField(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "message"
	}
	return strings.ReplaceAll(trimmed, "\n", " ")
}

func timeoutUnlessPath(timeout time.Duration, skipPrefix string) func(http.Handler) http.Handler {
	base := middleware.Timeout(timeout)
	return func(next http.Handler) http.Handler {
		withTimeout := base(next)

		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, skipPrefix) {
				next.ServeHTTP(w, r)
				return
			}
			withTimeout.ServeHTTP(w, r)
		})
	}
}
