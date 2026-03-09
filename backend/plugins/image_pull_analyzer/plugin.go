package image_pull_analyzer

import (
	"kubelens-backend/internal/intelligence"
	"kubelens-backend/internal/intelligence/rules"
	"kubelens-backend/internal/state"
)

type Plugin struct{}

func New() Plugin { return Plugin{} }

func (Plugin) Name() string { return "image_pull_analyzer" }

func (Plugin) Analyze(snapshot state.ClusterState) []intelligence.Diagnostic {
	diagnostics := make([]intelligence.Diagnostic, 0)

	for _, pod := range snapshot.Pods {
		if rules.IsImagePullFailure(pod) {
			diagnostics = append(diagnostics, intelligence.Diagnostic{
				Severity:       intelligence.SeverityWarning,
				Resource:       pod.Name,
				Namespace:      pod.Namespace,
				Message:        "Pod image pull failure",
				Evidence:       []string{"Container waiting with ImagePullBackOff or ErrImagePull."},
				Recommendation: "Verify image tag, registry credentials, and node network reachability.",
			})
		}
	}
	return diagnostics
}
