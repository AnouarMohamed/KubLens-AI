package ai

import "strings"

// BuildRecommendations deduplicates and caps remediation steps.
func BuildRecommendations(diags []DiagnosticBrief, limit int) []string {
	if limit <= 0 {
		limit = 5
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, limit)
	for _, diag := range diags {
		rec := strings.TrimSpace(diag.Recommendation)
		if rec == "" {
			continue
		}
		if _, ok := seen[rec]; ok {
			continue
		}
		seen[rec] = struct{}{}
		out = append(out, rec)
		if len(out) >= limit {
			break
		}
	}
	return out
}
