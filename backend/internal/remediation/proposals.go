package remediation

import (
	"fmt"
	"sort"
	"strings"

	"kubelens-backend/internal/model"
)

func ProposeFromDiagnostics(
	diag model.DiagnosticsResult,
	pods []model.PodSummary,
	nodes []model.NodeSummary,
) []model.RemediationProposal {
	out := make([]model.RemediationProposal, 0, 16)
	seen := map[string]struct{}{}

	add := func(proposal model.RemediationProposal) {
		key := string(proposal.Kind) + "|" + strings.ToLower(strings.TrimSpace(proposal.Namespace)) + "|" + strings.ToLower(strings.TrimSpace(proposal.Resource))
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		proposal.Status = "proposed"
		out = append(out, proposal)
	}

	for _, issue := range diag.Issues {
		if issue.Severity != model.SeverityCritical {
			continue
		}

		messageLower := strings.ToLower(issue.Message + " " + strings.Join(issue.Evidence, " "))
		if containsResourcePendingSignal(messageLower) {
			// Pending/resource-quota issues are intentionally skipped because restart/scale does not resolve quota exhaustion.
			continue
		}

		namespace, podName, ok := splitNamespacedResource(issue.Resource)
		if !ok {
			continue
		}

		add(model.RemediationProposal{
			Kind:      model.RemediationKindRestartPod,
			Namespace: namespace,
			Resource:  podName,
			Reason:    defaultString(issue.Message, "Critical pod issue detected"),
			RiskLevel: "low",
			DryRunResult: fmt.Sprintf(
				"Pod %s in namespace %s would be terminated and recreated by its owning ReplicaSet. Expect ~30s of downtime for this specific pod instance.",
				podName,
				namespace,
			),
		})
	}

	for _, node := range nodes {
		if node.Status != model.NodeStatusNotReady {
			continue
		}
		nodeName := strings.TrimSpace(node.Name)
		if nodeName == "" {
			continue
		}

		add(model.RemediationProposal{
			Kind:      model.RemediationKindCordonNode,
			Namespace: "",
			Resource:  nodeName,
			Reason:    "Node reports NotReady; cordon to prevent additional scheduling pressure.",
			RiskLevel: "high",
			DryRunResult: fmt.Sprintf(
				"Node %s would be marked unschedulable. Existing workloads would continue running, but no new pods would schedule on this node.",
				nodeName,
			),
		})
	}

	type deploymentRisk struct {
		namespace string
		name      string
		restarts  int32
	}
	rollbacks := make([]deploymentRisk, 0, 8)
	deploymentRestarts := map[string]int32{}
	for _, pod := range pods {
		if pod.Restarts <= 0 {
			continue
		}
		deploymentName := incidentInferDeploymentName(pod.Name)
		if deploymentName == "" {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(pod.Namespace)) + "/" + strings.ToLower(deploymentName)
		deploymentRestarts[key] += pod.Restarts
	}
	for key, totalRestarts := range deploymentRestarts {
		if totalRestarts <= 5 {
			continue
		}
		parts := strings.SplitN(key, "/", 2)
		if len(parts) != 2 {
			continue
		}
		rollbacks = append(rollbacks, deploymentRisk{
			namespace: parts[0],
			name:      parts[1],
			restarts:  totalRestarts,
		})
	}
	sort.SliceStable(rollbacks, func(i, j int) bool {
		if rollbacks[i].namespace == rollbacks[j].namespace {
			return rollbacks[i].name < rollbacks[j].name
		}
		return rollbacks[i].namespace < rollbacks[j].namespace
	})
	for _, item := range rollbacks {
		add(model.RemediationProposal{
			Kind:      model.RemediationKindRollbackDeployment,
			Namespace: item.namespace,
			Resource:  item.name,
			Reason:    fmt.Sprintf("Deployment restart count exceeds threshold (%d restarts).", item.restarts),
			RiskLevel: "medium",
			DryRunResult: fmt.Sprintf(
				"Deployment %s/%s would be rolled back to the previous ReplicaSet revision. Existing pods may be replaced during rollout.",
				item.namespace,
				item.name,
			),
		})
	}

	return out
}

func containsResourcePendingSignal(value string) bool {
	lower := strings.ToLower(strings.TrimSpace(value))
	if lower == "" {
		return false
	}
	if strings.Contains(lower, "pending") && (strings.Contains(lower, "resource") || strings.Contains(lower, "quota")) {
		return true
	}
	if strings.Contains(lower, "insufficient cpu") || strings.Contains(lower, "insufficient memory") {
		return true
	}
	if strings.Contains(lower, "exceeded quota") || strings.Contains(lower, "resourcequota") {
		return true
	}
	return false
}

func splitNamespacedResource(resource string) (string, string, bool) {
	parts := strings.Split(strings.TrimSpace(resource), "/")
	if len(parts) != 2 {
		return "", "", false
	}
	namespace := strings.TrimSpace(parts[0])
	name := strings.TrimSpace(parts[1])
	if namespace == "" || name == "" {
		return "", "", false
	}
	return namespace, name, true
}

func incidentInferDeploymentName(podName string) string {
	parts := strings.Split(strings.TrimSpace(strings.ToLower(podName)), "-")
	if len(parts) < 3 {
		return ""
	}
	if strings.TrimSpace(parts[len(parts)-1]) == "" || strings.TrimSpace(parts[len(parts)-2]) == "" {
		return ""
	}
	base := strings.Join(parts[:len(parts)-2], "-")
	return strings.Trim(base, "-")
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}
