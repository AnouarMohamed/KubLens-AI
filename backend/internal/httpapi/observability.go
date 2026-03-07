package httpapi

import (
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

type requestMetrics struct {
	startedAt time.Time
	now       func() time.Time

	inFlight      atomic.Int64
	totalRequests atomic.Uint64
	totalErrors   atomic.Uint64
	totalBytes    atomic.Uint64
	totalLatency  atomic.Uint64
	maxLatency    atomic.Uint64

	routes sync.Map // map[string]*routeMetrics keyed by "METHOD /route/pattern"
}

type routeMetrics struct {
	requests     atomic.Uint64
	errors       atomic.Uint64
	bytes        atomic.Uint64
	totalLatency atomic.Uint64
	maxLatency   atomic.Uint64
	status2xx    atomic.Uint64
	status3xx    atomic.Uint64
	status4xx    atomic.Uint64
	status5xx    atomic.Uint64
}

type metricsSnapshot struct {
	UptimeSeconds int64                 `json:"uptimeSeconds"`
	InFlight      int64                 `json:"inFlight"`
	TotalRequests uint64                `json:"totalRequests"`
	TotalErrors   uint64                `json:"totalErrors"`
	TotalBytes    uint64                `json:"totalBytes"`
	AvgLatencyMs  float64               `json:"avgLatencyMs"`
	MaxLatencyMs  float64               `json:"maxLatencyMs"`
	Routes        []routeMetricsSummary `json:"routes"`
}

type routeMetricsSummary struct {
	Route        string  `json:"route"`
	Requests     uint64  `json:"requests"`
	Errors       uint64  `json:"errors"`
	Bytes        uint64  `json:"bytes"`
	Status2xx    uint64  `json:"status2xx"`
	Status3xx    uint64  `json:"status3xx"`
	Status4xx    uint64  `json:"status4xx"`
	Status5xx    uint64  `json:"status5xx"`
	AvgLatencyMs float64 `json:"avgLatencyMs"`
	MaxLatencyMs float64 `json:"maxLatencyMs"`
}

func newRequestMetrics(now func() time.Time) *requestMetrics {
	if now == nil {
		now = time.Now
	}

	return &requestMetrics{
		startedAt: now(),
		now:       now,
	}
}

func (m *requestMetrics) middleware(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Measure the whole request lifecycle and record status/bytes from the wrapped writer.
			start := m.now()
			m.inFlight.Add(1)

			ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)

			m.inFlight.Add(-1)

			duration := m.now().Sub(start)
			status := ww.Status()
			if status == 0 {
				status = http.StatusOK
			}
			bytesWritten := uint64(ww.BytesWritten())
			route := routePattern(r)
			key := r.Method + " " + route

			m.observe(key, status, bytesWritten, duration)
			logRequest(logger, r, route, status, bytesWritten, duration)
		})
	}
}

func (m *requestMetrics) observe(route string, status int, bytesWritten uint64, duration time.Duration) {
	m.totalRequests.Add(1)
	m.totalBytes.Add(bytesWritten)

	latencyNS := uint64(duration.Nanoseconds())
	m.totalLatency.Add(latencyNS)
	updateMax(&m.maxLatency, latencyNS)

	if status >= http.StatusInternalServerError {
		m.totalErrors.Add(1)
	}

	metric := m.route(route)
	metric.requests.Add(1)
	metric.bytes.Add(bytesWritten)
	metric.totalLatency.Add(latencyNS)
	updateMax(&metric.maxLatency, latencyNS)
	if status >= http.StatusInternalServerError {
		metric.errors.Add(1)
	}

	switch status / 100 {
	case 2:
		metric.status2xx.Add(1)
	case 3:
		metric.status3xx.Add(1)
	case 4:
		metric.status4xx.Add(1)
	case 5:
		metric.status5xx.Add(1)
	}
}

func (m *requestMetrics) route(name string) *routeMetrics {
	if value, ok := m.routes.Load(name); ok {
		return value.(*routeMetrics)
	}

	created := &routeMetrics{}
	actual, _ := m.routes.LoadOrStore(name, created)
	return actual.(*routeMetrics)
}

func (m *requestMetrics) snapshot() metricsSnapshot {
	totalRequests := m.totalRequests.Load()
	totalLatency := m.totalLatency.Load()

	snap := metricsSnapshot{
		UptimeSeconds: int64(m.now().Sub(m.startedAt).Seconds()),
		InFlight:      m.inFlight.Load(),
		TotalRequests: totalRequests,
		TotalErrors:   m.totalErrors.Load(),
		TotalBytes:    m.totalBytes.Load(),
		MaxLatencyMs:  nsToMs(m.maxLatency.Load()),
		Routes:        make([]routeMetricsSummary, 0, 8),
	}
	if totalRequests > 0 {
		snap.AvgLatencyMs = nsToMs(totalLatency / totalRequests)
	}

	m.routes.Range(func(key, value any) bool {
		name := key.(string)
		metric := value.(*routeMetrics)
		requests := metric.requests.Load()

		item := routeMetricsSummary{
			Route:     name,
			Requests:  requests,
			Errors:    metric.errors.Load(),
			Bytes:     metric.bytes.Load(),
			Status2xx: metric.status2xx.Load(),
			Status3xx: metric.status3xx.Load(),
			Status4xx: metric.status4xx.Load(),
			Status5xx: metric.status5xx.Load(),
		}
		if requests > 0 {
			item.AvgLatencyMs = nsToMs(metric.totalLatency.Load() / requests)
		}
		item.MaxLatencyMs = nsToMs(metric.maxLatency.Load())

		snap.Routes = append(snap.Routes, item)
		return true
	})

	sort.Slice(snap.Routes, func(i, j int) bool {
		if snap.Routes[i].Requests == snap.Routes[j].Requests {
			return snap.Routes[i].Route < snap.Routes[j].Route
		}
		return snap.Routes[i].Requests > snap.Routes[j].Requests
	})

	return snap
}

func routePattern(r *http.Request) string {
	// Prefer chi route patterns to keep cardinality bounded for metrics keys.
	if routeCtx := chi.RouteContext(r.Context()); routeCtx != nil {
		pattern := strings.TrimSpace(routeCtx.RoutePattern())
		if pattern != "" {
			return pattern
		}
	}
	return r.URL.Path
}

func updateMax(target *atomic.Uint64, value uint64) {
	for {
		current := target.Load()
		if value <= current {
			return
		}
		if target.CompareAndSwap(current, value) {
			return
		}
	}
}

func nsToMs(nanos uint64) float64 {
	return float64(nanos) / float64(time.Millisecond)
}

func logRequest(logger *slog.Logger, r *http.Request, route string, status int, bytesWritten uint64, duration time.Duration) {
	if logger == nil {
		return
	}

	level := slog.LevelInfo
	if status >= http.StatusInternalServerError {
		level = slog.LevelError
	} else if status >= http.StatusBadRequest {
		level = slog.LevelWarn
	}

	logger.LogAttrs(r.Context(), level, "http_request",
		slog.String("request_id", middleware.GetReqID(r.Context())),
		slog.String("method", r.Method),
		slog.String("path", r.URL.Path),
		slog.String("route", route),
		slog.Int("status", status),
		slog.Float64("duration_ms", duration.Seconds()*1000),
		slog.Uint64("bytes", bytesWritten),
		slog.String("client_ip", r.RemoteAddr),
	)
}
