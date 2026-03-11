// Package node_health_analyzer reports node readiness and pressure issues.
package node_health_analyzer

import (
	"fmt"

	"kubelens-backend/internal/intelligence"
	"kubelens-backend/internal/intelligence/rules"
	"kubelens-backend/internal/state"
)

type Plugin struct{}

// New returns a node health analyzer plugin instance.
func New() Plugin { return Plugin{} }

// Name returns the stable plugin identifier.
func (Plugin) Name() string { return "node_health_analyzer" }

// Analyze emits diagnostics for NotReady nodes and pressure conditions.
func (Plugin) Analyze(snapshot state.ClusterState) []intelligence.Diagnostic {
	diagnostics := make([]intelligence.Diagnostic, 0)

	for _, node := range snapshot.Nodes {
		if rules.IsNodeNotReady(node) {
			diagnostics = append(diagnostics, intelligence.Diagnostic{
				Severity:       intelligence.SeverityCritical,
				Resource:       node.Name,
				Message:        "Node is not ready",
				Evidence:       []string{"Node Ready condition is false."},
				Recommendation: "Inspect kubelet health, connectivity, and node pressure conditions.",
			})
		}

		for _, cond := range []string{"MemoryPressure", "DiskPressure", "PIDPressure"} {
			if rules.NodeHasPressure(node, cond) {
				diagnostics = append(diagnostics, intelligence.Diagnostic{
					Severity:       intelligence.SeverityWarning,
					Resource:       node.Name,
					Message:        fmt.Sprintf("Node reporting %s", cond),
					Evidence:       []string{fmt.Sprintf("%s condition is True.", cond)},
					Recommendation: "Drain workloads or increase node capacity before scheduling additional pods.",
				})
			}
		}
	}

	return diagnostics
}
