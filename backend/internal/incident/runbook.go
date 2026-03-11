package incident

import (
	"fmt"
	"regexp"
	"strings"

	"kubelens-backend/internal/model"
)

var hashSegmentPattern = regexp.MustCompile(`^[a-z0-9-]+$`)

func BuildRunbook(
	diag model.DiagnosticsResult,
	pods []model.PodSummary,
	_ []model.IncidentPrediction,
) []model.RunbookStep {
	steps := make([]model.RunbookStep, 0, 16)
	seen := map[string]struct{}{}

	add := func(title, description, command string, mandatory bool) {
		title = strings.TrimSpace(title)
		description = strings.TrimSpace(description)
		command = strings.TrimSpace(command)
		if title == "" || description == "" {
			return
		}
		key := strings.ToLower(title + "|" + command)
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		steps = append(steps, model.RunbookStep{
			Title:       title,
			Description: description,
			Command:     command,
			Status:      model.RunbookStepStatusPending,
			Mandatory:   mandatory,
		})
	}

	for _, issue := range diag.Issues {
		if issue.Severity != model.SeverityCritical {
			continue
		}
		namespace, podName, ok := splitNamespacedResource(issue.Resource)
		if !ok {
			continue
		}
		add(
			fmt.Sprintf("Investigate critical pod %s/%s", namespace, podName),
			issueToDescription(issue, "Capture current pod state and prior crash output to confirm root cause."),
			fmt.Sprintf("kubectl describe pod %s -n %s && kubectl logs %s -n %s --previous --tail=200", podName, namespace, podName, namespace),
			false,
		)
	}

	for _, issue := range diag.Issues {
		if issue.Severity != model.SeverityWarning {
			continue
		}
		namespace, podName, ok := splitNamespacedResource(issue.Resource)
		if !ok {
			continue
		}
		deployment := inferDeploymentName(podName)
		if deployment == "" {
			continue
		}
		add(
			fmt.Sprintf("Restart unstable deployment %s/%s", namespace, deployment),
			issueToDescription(issue, "Roll the deployment to recover from warning-level pod instability."),
			fmt.Sprintf("kubectl rollout restart deployment/%s -n %s", deployment, namespace),
			false,
		)
	}

	for _, issue := range diag.Issues {
		messageLower := strings.ToLower(issue.Message)
		if strings.Contains(issue.Resource, "/") {
			continue
		}
		if !strings.Contains(messageLower, "node") && !strings.Contains(messageLower, "not ready") {
			continue
		}
		nodeName := strings.TrimSpace(issue.Resource)
		if nodeName == "" {
			continue
		}
		add(
			fmt.Sprintf("Inspect node %s", nodeName),
			issueToDescription(issue, "Inspect node conditions and pressure signals before scheduling additional workloads."),
			fmt.Sprintf("kubectl describe node %s", nodeName),
			false,
		)
	}

	for _, pod := range pods {
		if pod.Status != model.PodStatusPending {
			continue
		}
		add(
			fmt.Sprintf("Diagnose pending pod %s/%s", pod.Namespace, pod.Name),
			"Pending pods frequently indicate scheduler constraints, quota pressure, or unavailable dependencies.",
			fmt.Sprintf("kubectl describe pod %s -n %s", pod.Name, pod.Namespace),
			false,
		)
	}

	add(
		"Verify cluster health",
		"Confirm all critical workloads are stable and no new warnings were introduced by remediation actions.",
		"kubectl get pods -A && kubectl get nodes",
		true,
	)

	for i := range steps {
		steps[i].ID = fmt.Sprintf("step-%d", i+1)
	}

	return steps
}

func inferDeploymentName(podName string) string {
	parts := strings.Split(strings.TrimSpace(strings.ToLower(podName)), "-")
	if len(parts) < 3 {
		return ""
	}

	last := parts[len(parts)-1]
	secondLast := parts[len(parts)-2]
	if !hashSegmentPattern.MatchString(last) || !hashSegmentPattern.MatchString(secondLast) {
		return ""
	}

	base := strings.Join(parts[:len(parts)-2], "-")
	base = strings.Trim(base, "-")
	return base
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

func issueToDescription(issue model.DiagnosticIssue, fallback string) string {
	message := strings.TrimSpace(issue.Message)
	recommendation := strings.TrimSpace(issue.Recommendation)
	switch {
	case message != "" && recommendation != "":
		return message + ". " + recommendation
	case message != "":
		return message
	case recommendation != "":
		return recommendation
	default:
		return fallback
	}
}
