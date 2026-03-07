package diagnostics

import (
	"fmt"
	"strings"

	"kubelens-backend/internal/model"
)

func buildSummary(healthScore int, pods []model.PodSummary, nodes []model.NodeSummary, issues []model.DiagnosticIssue) string {
	running, pending, failed := podStatusCounts(pods)
	ready, notReady := nodeStatusCounts(nodes)

	lines := []string{
		fmt.Sprintf("### Cluster Health Score: %d/100", healthScore),
		"",
		fmt.Sprintf("- Pods: %d total (%d running, %d pending, %d failed)", len(pods), running, pending, failed),
		fmt.Sprintf("- Nodes: %d total (%d ready, %d not ready)", len(nodes), ready, notReady),
		"",
	}

	if len(issues) == 1 && issues[0].Severity == model.SeverityInfo {
		lines = append(lines, "No critical or warning issues were detected in the current snapshot.")
		return strings.Join(lines, "\n")
	}

	lines = append(lines, "### Findings")
	for _, issue := range issues {
		if issue.Severity == model.SeverityInfo {
			continue
		}

		title := issue.Title
		if issue.Resource != "" {
			title = fmt.Sprintf("%s (%s)", issue.Title, issue.Resource)
		}

		lines = append(lines,
			fmt.Sprintf("- **%s**: %s", strings.ToUpper(string(issue.Severity)), title),
			fmt.Sprintf("  - %s", issue.Details),
			fmt.Sprintf("  - Recommended action: %s", issue.Recommendation),
		)
	}

	return strings.Join(lines, "\n")
}

func podStatusCounts(pods []model.PodSummary) (running int, pending int, failed int) {
	for _, pod := range pods {
		switch pod.Status {
		case model.PodStatusRunning:
			running++
		case model.PodStatusPending:
			pending++
		case model.PodStatusFailed:
			failed++
		}
	}
	return running, pending, failed
}

func nodeStatusCounts(nodes []model.NodeSummary) (ready int, notReady int) {
	for _, node := range nodes {
		if node.Status == model.NodeStatusReady {
			ready++
		}
		if node.Status == model.NodeStatusNotReady {
			notReady++
		}
	}
	return ready, notReady
}
