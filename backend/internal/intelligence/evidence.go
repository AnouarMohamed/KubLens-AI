package intelligence

import "strings"

func appendEvidence(target []string, values ...string) []string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		target = append(target, trimmed)
	}
	return target
}

func dedupeEvidence(values []string) []string {
	if len(values) == 0 {
		return values
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}
	return out
}
