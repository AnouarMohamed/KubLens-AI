package diagnostics

import (
	"fmt"
	"time"

	"kubelens-backend/internal/model"
)

const (
	criticalPenalty = 25
	warningPenalty  = 10
	maxHealthScore  = 100
	minHealthScore  = 0
)

// BuildDiagnostics computes deterministic cluster health signals from pod/node snapshots.
// The function is intentionally rule-based so it is predictable, testable, and auditable.
func BuildDiagnostics(pods []model.PodSummary, nodes []model.NodeSummary) model.DiagnosticsResult {
	issues := make([]model.DiagnosticIssue, 0)

	for _, pod := range pods {
		switch pod.Status {
		case model.PodStatusFailed:
			issues = append(issues, model.DiagnosticIssue{
				Severity:       model.SeverityCritical,
				Message:        "Failed pod detected",
				Resource:       fmt.Sprintf("%s/%s", pod.Namespace, pod.Name),
				Evidence:       []string{fmt.Sprintf("Pod has status %s with %d restarts.", pod.Status, pod.Restarts)},
				Recommendation: "Inspect pod events and logs before restarting the workload.",
			})
		case model.PodStatusPending:
			issues = append(issues, model.DiagnosticIssue{
				Severity:       model.SeverityWarning,
				Message:        "Pending pod detected",
				Resource:       fmt.Sprintf("%s/%s", pod.Namespace, pod.Name),
				Evidence:       []string{"Pod is not fully scheduled or started yet."},
				Recommendation: "Check scheduler events, image pull status, and resource requests.",
			})
		}

		if pod.Restarts >= 3 {
			issues = append(issues, model.DiagnosticIssue{
				Severity:       model.SeverityWarning,
				Message:        "High restart count",
				Resource:       fmt.Sprintf("%s/%s", pod.Namespace, pod.Name),
				Evidence:       []string{fmt.Sprintf("%d container restarts observed.", pod.Restarts)},
				Recommendation: "Review crash loops, probes, and service dependencies.",
			})
		}
	}

	for _, node := range nodes {
		if node.Status == model.NodeStatusNotReady {
			issues = append(issues, model.DiagnosticIssue{
				Severity:       model.SeverityCritical,
				Message:        "Node not ready",
				Resource:       node.Name,
				Evidence:       []string{"Node is reporting NotReady conditions."},
				Recommendation: "Validate kubelet health, node connectivity, and pressure conditions.",
			})
		}
	}

	issues = ensureAtLeastOneIssue(issues)

	critical, warning := countSeverity(issues)
	healthScore := clampHealthScore(maxHealthScore - (critical * criticalPenalty) - (warning * warningPenalty))

	return model.DiagnosticsResult{
		Summary:        buildSummary(healthScore, pods, nodes, issues),
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
		CriticalIssues: critical,
		WarningIssues:  warning,
		HealthScore:    healthScore,
		Issues:         issues,
	}
}

func ensureAtLeastOneIssue(issues []model.DiagnosticIssue) []model.DiagnosticIssue {
	if len(issues) > 0 {
		return issues
	}

	return append(issues, model.DiagnosticIssue{
		Severity:       model.SeverityInfo,
		Message:        "Cluster healthy",
		Evidence:       []string{"No failed pods, pending pods, or not-ready nodes were detected."},
		Recommendation: "Continue monitoring and keep alerting enabled.",
	})
}

func countSeverity(issues []model.DiagnosticIssue) (critical int, warning int) {
	for _, issue := range issues {
		switch issue.Severity {
		case model.SeverityCritical:
			critical++
		case model.SeverityWarning:
			warning++
		}
	}
	return critical, warning
}

func clampHealthScore(score int) int {
	if score < minHealthScore {
		return minHealthScore
	}
	if score > maxHealthScore {
		return maxHealthScore
	}
	return score
}
