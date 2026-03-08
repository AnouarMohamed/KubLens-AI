package httpapi

import (
	"fmt"
	"net/http"
	"strings"
)

func (s *Server) handlePrometheusMetrics(w http.ResponseWriter, _ *http.Request) {
	snap := s.metrics.snapshot()
	runtime := s.runtimeSnapshot()

	var b strings.Builder
	writePrometheusMetric(&b, "kubelens_http_requests_total", float64(snap.TotalRequests), nil)
	writePrometheusMetric(&b, "kubelens_http_errors_total", float64(snap.TotalErrors), nil)
	writePrometheusMetric(&b, "kubelens_http_inflight_requests", float64(snap.InFlight), nil)
	writePrometheusMetric(&b, "kubelens_http_uptime_seconds", float64(snap.UptimeSeconds), nil)
	writePrometheusMetric(&b, "kubelens_http_latency_avg_ms", snap.AvgLatencyMs, nil)
	writePrometheusMetric(&b, "kubelens_http_latency_max_ms", snap.MaxLatencyMs, nil)

	writePrometheusMetric(&b, "kubelens_runtime_auth_enabled", boolToGauge(runtime.AuthEnabled), nil)
	writePrometheusMetric(&b, "kubelens_runtime_write_actions_enabled", boolToGauge(runtime.WriteActionsEnabled), nil)
	writePrometheusMetric(&b, "kubelens_runtime_terminal_enabled", boolToGauge(runtime.TerminalEnabled), nil)
	writePrometheusMetric(&b, "kubelens_runtime_predictor_enabled", boolToGauge(runtime.PredictorEnabled), nil)
	writePrometheusMetric(&b, "kubelens_runtime_predictor_healthy", boolToGauge(runtime.PredictorHealthy), nil)

	for _, route := range snap.Routes {
		labels := map[string]string{"route": route.Route}
		writePrometheusMetric(&b, "kubelens_http_route_requests_total", float64(route.Requests), labels)
		writePrometheusMetric(&b, "kubelens_http_route_errors_total", float64(route.Errors), labels)
		writePrometheusMetric(&b, "kubelens_http_route_status_2xx_total", float64(route.Status2xx), labels)
		writePrometheusMetric(&b, "kubelens_http_route_status_3xx_total", float64(route.Status3xx), labels)
		writePrometheusMetric(&b, "kubelens_http_route_status_4xx_total", float64(route.Status4xx), labels)
		writePrometheusMetric(&b, "kubelens_http_route_status_5xx_total", float64(route.Status5xx), labels)
	}

	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(b.String()))
}

func writePrometheusMetric(b *strings.Builder, name string, value float64, labels map[string]string) {
	if len(labels) == 0 {
		_, _ = fmt.Fprintf(b, "%s %v\n", name, value)
		return
	}

	first := true
	b.WriteString(name)
	b.WriteString("{")
	for key, rawValue := range labels {
		if !first {
			b.WriteString(",")
		}
		first = false
		b.WriteString(key)
		b.WriteString("=\"")
		b.WriteString(escapePrometheusLabel(rawValue))
		b.WriteString("\"")
	}
	b.WriteString("} ")
	_, _ = fmt.Fprintf(b, "%v\n", value)
}

func escapePrometheusLabel(value string) string {
	replacer := strings.NewReplacer("\\", "\\\\", "\"", "\\\"", "\n", " ")
	return replacer.Replace(value)
}

func boolToGauge(value bool) float64 {
	if value {
		return 1
	}
	return 0
}
