package scheduling_analyzer

import (
	"kubelens-backend/internal/intelligence"
	"kubelens-backend/internal/intelligence/rules"
	"kubelens-backend/internal/state"
	"kubelens-backend/plugins"
)

type Plugin struct{}

func New() Plugin { return Plugin{} }

func (Plugin) Name() string { return "scheduling_analyzer" }

func (Plugin) Analyze(snapshot state.ClusterState) []intelligence.Diagnostic {
	diagnostics := make([]intelligence.Diagnostic, 0)

	for _, pod := range snapshot.Pods {
		if !rules.IsPending(pod) {
			continue
		}
		events := plugins.PodEvents(snapshot, pod.Namespace, pod.Name)
		if !plugins.HasEventReason(events, "FailedScheduling") {
			continue
		}
		diagnostics = append(diagnostics, intelligence.Diagnostic{
			Severity:       intelligence.SeverityWarning,
			Resource:       pod.Name,
			Namespace:      pod.Namespace,
			Message:        "Pod pending due to scheduling failure",
			Evidence:       []string{"Events include FailedScheduling for this pod."},
			Recommendation: "Review node capacity, resource requests, taints/tolerations, and node selectors.",
		})
	}

	return diagnostics
}
