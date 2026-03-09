package ai

import (
	"fmt"
	"sort"
	"strings"
)

// ExplainDiagnostics builds a deterministic explanation from structured diagnostics.
func ExplainDiagnostics(diags []DiagnosticBrief) string {
	if len(diags) == 0 {
		return "No diagnostic findings were provided."
	}

	ordered := append([]DiagnosticBrief(nil), diags...)
	sortDiagnostics(ordered)

	lines := []string{
		"### Most likely root cause",
		fmt.Sprintf("- %s", ordered[0].Message),
		"",
		"### Evidence",
	}

	for _, evidence := range ordered[0].Evidence {
		lines = append(lines, "- "+evidence)
	}

	if len(ordered) > 1 {
		lines = append(lines, "", "### Additional findings")
		for _, diag := range ordered[1:] {
			lines = append(lines, fmt.Sprintf("- %s", diag.Message))
		}
	}

	recommendations := BuildRecommendations(ordered, 5)
	lines = append(lines, "", "### Safe fix plan")
	for _, recommendation := range recommendations {
		lines = append(lines, "- "+recommendation)
	}

	return strings.Join(lines, "\n")
}

func sortDiagnostics(items []DiagnosticBrief) {
	rank := map[string]int{
		"critical": 0,
		"warning":  1,
		"info":     2,
	}
	sort.SliceStable(items, func(i, j int) bool {
		ri := rank[strings.ToLower(items[i].Severity)]
		rj := rank[strings.ToLower(items[j].Severity)]
		if ri == rj {
			return items[i].Message < items[j].Message
		}
		return ri < rj
	})
}
