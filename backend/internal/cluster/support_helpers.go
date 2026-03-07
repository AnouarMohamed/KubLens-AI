package cluster

import (
	"fmt"
	"strings"
	"time"

	"kubelens-backend/internal/model"
)

func cloneNodeSummaries(in []model.NodeSummary) []model.NodeSummary {
	out := make([]model.NodeSummary, len(in))
	for i := range in {
		out[i] = in[i]
		out[i].CPUHistory = append([]model.CPUPoint(nil), in[i].CPUHistory...)
	}
	return out
}

func formatAge(t time.Time) string {
	if t.IsZero() {
		return "N/A"
	}

	diff := time.Since(t)
	if diff < 0 {
		return "N/A"
	}
	if diff < time.Minute {
		return "just now"
	}
	if diff < time.Hour {
		return fmt.Sprintf("%dm", int(diff.Minutes()))
	}
	if diff < 24*time.Hour {
		return fmt.Sprintf("%dh", int(diff.Hours()))
	}
	return fmt.Sprintf("%dd", int(diff.Hours()/24))
}

func formatRFC3339(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func boolToStatus(value bool) string {
	if value {
		return "True"
	}
	return "False"
}
