package httpapi

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"kubelens-backend/internal/model"
)

type resourceHint struct {
	kind      string
	name      string
	namespace string
}

var (
	namespacePattern = regexp.MustCompile(`(?i)\b(?:namespace|ns)\s+([a-z0-9-]+)\b`)
	resourcePattern  = regexp.MustCompile(`(?i)\b(pod|node|deployment|statefulset|daemonset|job|cronjob|service|ingress)\s+([a-z0-9-]+)\b`)
)

func (s *Server) buildEnrichedContext(ctx context.Context, c assistantContext) string {
	sections := make([]string, 0, 6)

	stats := model.ClusterStats{
		Pods: model.PodStats{
			Total:   len(c.pods),
			Running: countPods(c.pods, model.PodStatusRunning),
			Pending: countPods(c.pods, model.PodStatusPending),
			Failed:  countPods(c.pods, model.PodStatusFailed),
		},
		Nodes: model.NodeStats{
			Total:    len(c.nodes),
			Ready:    countNodes(c.nodes, model.NodeStatusReady),
			NotReady: countNodesNotReady(c.nodes),
		},
		Cluster: clusterCapacityFromNodes(c.nodes, s.cluster.IsRealCluster()),
	}
	sections = append(sections, fmt.Sprintf(
		"Cluster stats: pods total=%d (running=%d pending=%d failed=%d), nodes total=%d (ready=%d notReady=%d), cpu=%s, memory=%s",
		stats.Pods.Total,
		stats.Pods.Running,
		stats.Pods.Pending,
		stats.Pods.Failed,
		stats.Nodes.Total,
		stats.Nodes.Ready,
		stats.Nodes.NotReady,
		stats.Cluster.CPU,
		stats.Cluster.Memory,
	))

	if len(c.diagnostics.Issues) > 0 {
		sections = append(sections, formatDiagnosticsIssues(c.diagnostics))
	}

	messageLower := strings.ToLower(c.userMessage)
	namespaceHint := extractNamespaceHint(messageLower)
	hints := extractResourceHints(messageLower)
	hints = append(hints, resourceHintsFromReferences(c.resources)...)

	pods := selectPodsForContext(c.pods, c.diagnostics, hints, namespaceHint, messageLower)
	nodes := selectNodesForContext(c.nodes, c.diagnostics, hints, messageLower)
	workloads := selectWorkloadsForContext(hints, namespaceHint, messageLower)

	if len(pods) > 0 {
		sections = append(sections, s.formatPodContext(ctx, pods))
	}
	if len(nodes) > 0 {
		sections = append(sections, s.formatNodeContext(ctx, nodes))
	}
	if len(workloads) > 0 {
		sections = append(sections, s.formatWorkloadContext(ctx, workloads))
	}

	if len(sections) == 0 {
		return "No enriched context available."
	}
	return strings.Join(sections, "\n\n")
}

func extractNamespaceHint(messageLower string) string {
	match := namespacePattern.FindStringSubmatch(messageLower)
	if len(match) >= 2 {
		return strings.TrimSpace(match[1])
	}
	return ""
}

func extractResourceHints(messageLower string) []resourceHint {
	matches := resourcePattern.FindAllStringSubmatch(messageLower, -1)
	if len(matches) == 0 {
		return nil
	}

	out := make([]resourceHint, 0, len(matches))
	for _, match := range matches {
		if len(match) < 3 {
			continue
		}
		out = append(out, resourceHint{
			kind: strings.ToLower(match[1]),
			name: strings.TrimSpace(match[2]),
		})
	}
	return out
}

func resourceHintsFromReferences(refs []string) []resourceHint {
	if len(refs) == 0 {
		return nil
	}
	out := make([]resourceHint, 0, len(refs))
	for _, ref := range refs {
		trimmed := strings.TrimSpace(ref)
		if trimmed == "" {
			continue
		}
		parts := strings.SplitN(trimmed, "/", 2)
		if len(parts) == 2 {
			out = append(out, resourceHint{
				kind:      "pod",
				namespace: strings.TrimSpace(parts[0]),
				name:      strings.TrimSpace(parts[1]),
			})
			continue
		}
		out = append(out, resourceHint{kind: "node", name: trimmed})
	}
	return out
}

func selectPodsForContext(
	pods []model.PodSummary,
	diag model.DiagnosticsResult,
	hints []resourceHint,
	namespaceHint string,
	messageLower string,
) []model.PodSummary {
	selected := make([]model.PodSummary, 0, 2)
	seen := map[string]struct{}{}

	addPod := func(pod model.PodSummary) {
		key := pod.Namespace + "/" + pod.Name
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		selected = append(selected, pod)
	}

	for _, hint := range hints {
		if hint.kind != "pod" {
			continue
		}
		for _, pod := range pods {
			if hint.name != "" && !strings.EqualFold(pod.Name, hint.name) {
				continue
			}
			if hint.namespace != "" && !strings.EqualFold(pod.Namespace, hint.namespace) {
				continue
			}
			addPod(pod)
		}
	}

	for _, pod := range pods {
		if len(selected) >= 2 {
			break
		}
		if namespaceHint != "" && !strings.EqualFold(pod.Namespace, namespaceHint) {
			continue
		}
		if strings.Contains(messageLower, strings.ToLower(pod.Name)) {
			addPod(pod)
		}
	}

	if len(selected) == 0 && strings.Contains(messageLower, "pod") {
		for _, pod := range pods {
			if pod.Status != model.PodStatusRunning || pod.Restarts >= 3 {
				addPod(pod)
				if len(selected) >= 2 {
					break
				}
			}
		}
	}

	if len(selected) == 0 {
		for _, issue := range diag.Issues {
			parts := strings.SplitN(issue.Resource, "/", 2)
			if len(parts) != 2 {
				continue
			}
			for _, pod := range pods {
				if pod.Namespace == parts[0] && pod.Name == parts[1] {
					addPod(pod)
					if len(selected) >= 2 {
						return selected
					}
				}
			}
		}
	}

	return selected
}

func selectNodesForContext(
	nodes []model.NodeSummary,
	diag model.DiagnosticsResult,
	hints []resourceHint,
	messageLower string,
) []model.NodeSummary {
	selected := make([]model.NodeSummary, 0, 2)
	seen := map[string]struct{}{}

	addNode := func(node model.NodeSummary) {
		if _, ok := seen[node.Name]; ok {
			return
		}
		seen[node.Name] = struct{}{}
		selected = append(selected, node)
	}

	for _, hint := range hints {
		if hint.kind != "node" {
			continue
		}
		for _, node := range nodes {
			if hint.name != "" && !strings.EqualFold(node.Name, hint.name) {
				continue
			}
			addNode(node)
		}
	}

	for _, node := range nodes {
		if len(selected) >= 2 {
			break
		}
		if strings.Contains(messageLower, strings.ToLower(node.Name)) {
			addNode(node)
		}
	}

	if len(selected) == 0 && strings.Contains(messageLower, "node") {
		for _, node := range nodes {
			if node.Status != model.NodeStatusReady {
				addNode(node)
				if len(selected) >= 2 {
					break
				}
			}
		}
	}

	if len(selected) == 0 {
		for _, issue := range diag.Issues {
			for _, node := range nodes {
				if node.Name == issue.Resource {
					addNode(node)
					if len(selected) >= 2 {
						return selected
					}
				}
			}
		}
	}

	return selected
}

func selectWorkloadsForContext(hints []resourceHint, namespaceHint string, messageLower string) []resourceHint {
	if len(hints) == 0 {
		return nil
	}
	out := make([]resourceHint, 0, 2)
	for _, hint := range hints {
		if hint.kind == "pod" || hint.kind == "node" {
			continue
		}
		if hint.namespace == "" && namespaceHint != "" {
			hint.namespace = namespaceHint
		}
		out = append(out, hint)
		if len(out) >= 2 {
			break
		}
	}

	if len(out) == 0 && strings.Contains(messageLower, "deployment") {
		out = append(out, resourceHint{kind: "deployment", namespace: namespaceHint})
	}

	return out
}

func formatDiagnosticsIssues(diag model.DiagnosticsResult) string {
	if len(diag.Issues) == 0 {
		return "Diagnostics issues: none detected."
	}

	lines := make([]string, 0, 6)
	lines = append(lines, fmt.Sprintf("Diagnostics issues (health score %d):", diag.HealthScore))
	for i, issue := range diag.Issues {
		if i >= 5 {
			break
		}
		resource := issue.Resource
		if resource != "" {
			resource = " (" + resource + ")"
		}
		message := issue.Message
		if message == "" {
			message = "Finding"
		}
		lines = append(lines, fmt.Sprintf("- %s%s: %s", message, resource, strings.Join(issue.Evidence, " | ")))
	}
	return strings.Join(lines, "\n")
}

func (s *Server) formatPodContext(ctx context.Context, pods []model.PodSummary) string {
	lines := make([]string, 0, len(pods)*3)
	lines = append(lines, "Pod details:")
	for _, pod := range pods {
		lines = append(lines, s.describePod(ctx, pod)...)
	}
	return strings.Join(lines, "\n")
}

func (s *Server) describePod(ctx context.Context, pod model.PodSummary) []string {
	detail, err := s.cluster.PodDetail(ctx, pod.Namespace, pod.Name)
	if err != nil {
		detail = model.PodDetail{PodSummary: pod}
	}

	line := fmt.Sprintf(
		"- %s/%s status=%s restarts=%d cpu=%s memory=%s age=%s",
		pod.Namespace,
		pod.Name,
		pod.Status,
		pod.Restarts,
		pod.CPU,
		pod.Memory,
		pod.Age,
	)
	if detail.NodeName != "" {
		line += " node=" + detail.NodeName
	}

	if len(detail.Containers) > 0 {
		containerNames := make([]string, 0, len(detail.Containers))
		for _, container := range detail.Containers {
			containerNames = append(containerNames, container.Name)
		}
		line += " containers=" + strings.Join(containerNames, ",")
	}

	lines := []string{line}

	events := s.cluster.PodEvents(ctx, pod.Namespace, pod.Name)
	if summary := summarizeEvents(events, 6); summary != "" {
		lines = append(lines, "  events: "+summary)
	}

	logs := strings.TrimSpace(s.cluster.PodLogs(ctx, pod.Namespace, pod.Name, "", 50))
	if logs != "" {
		lines = append(lines, "  logs:\n"+indentString(formatLogSnippet(logs, 14, 1600), "    "))
	}

	return lines
}

func (s *Server) formatNodeContext(ctx context.Context, nodes []model.NodeSummary) string {
	lines := make([]string, 0, len(nodes)*2)
	lines = append(lines, "Node details:")
	for _, node := range nodes {
		lines = append(lines, s.describeNode(ctx, node)...)
	}
	return strings.Join(lines, "\n")
}

func (s *Server) describeNode(ctx context.Context, node model.NodeSummary) []string {
	detail, err := s.cluster.NodeDetail(ctx, node.Name)
	if err != nil {
		detail = model.NodeDetail{NodeSummary: node}
	}

	line := fmt.Sprintf(
		"- %s status=%s roles=%s cpu=%s memory=%s age=%s version=%s",
		node.Name,
		node.Status,
		node.Roles,
		node.CPUUsage,
		node.MemUsage,
		node.Age,
		node.Version,
	)

	lines := []string{line}
	if len(detail.Conditions) > 0 {
		conditions := make([]string, 0, 4)
		for _, condition := range detail.Conditions {
			if condition.Status == "" {
				continue
			}
			conditions = append(conditions, fmt.Sprintf("%s=%s", condition.Type, condition.Status))
		}
		if len(conditions) > 0 {
			lines = append(lines, "  conditions: "+strings.Join(conditions, ", "))
		}
	}
	return lines
}

func (s *Server) formatWorkloadContext(ctx context.Context, workloads []resourceHint) string {
	lines := make([]string, 0, len(workloads)+1)
	lines = append(lines, "Workload details:")
	for _, hint := range workloads {
		lines = append(lines, s.describeWorkload(ctx, hint))
	}
	return strings.Join(lines, "\n")
}

func (s *Server) describeWorkload(ctx context.Context, hint resourceHint) string {
	kind := strings.ToLower(hint.kind)
	if kind == "" {
		return "- workload: unspecified"
	}
	resourceKind := toResourceKind(kind)
	if resourceKind == "" {
		return fmt.Sprintf("- %s %s: unsupported kind", kind, hint.name)
	}

	records, err := s.cluster.ListResources(ctx, resourceKind)
	if err != nil {
		return fmt.Sprintf("- %s %s: %v", kind, hint.name, err)
	}

	name := strings.TrimSpace(hint.name)
	namespace := strings.TrimSpace(hint.namespace)
	if name == "" && len(records) > 0 {
		record := records[0]
		name = record.Name
		namespace = record.Namespace
	}

	for _, record := range records {
		if name != "" && !strings.EqualFold(record.Name, name) {
			continue
		}
		if namespace != "" && !strings.EqualFold(record.Namespace, namespace) {
			continue
		}
		resource := record.Name
		if record.Namespace != "" {
			resource = record.Namespace + "/" + record.Name
		}
		summary := strings.TrimSpace(record.Summary)
		if summary != "" {
			return fmt.Sprintf("- %s %s: status=%s age=%s summary=%s", kind, resource, record.Status, record.Age, summary)
		}
		return fmt.Sprintf("- %s %s: status=%s age=%s", kind, resource, record.Status, record.Age)
	}

	if name == "" {
		return fmt.Sprintf("- %s: no matching resources", kind)
	}
	return fmt.Sprintf("- %s %s: not found", kind, name)
}

func toResourceKind(kind string) string {
	switch strings.ToLower(kind) {
	case "deployment":
		return "deployments"
	case "statefulset":
		return "statefulsets"
	case "daemonset":
		return "daemonsets"
	case "job":
		return "jobs"
	case "cronjob":
		return "cronjobs"
	case "service":
		return "services"
	case "ingress":
		return "ingresses"
	default:
		return ""
	}
}

func summarizeEvents(events []model.K8sEvent, limit int) string {
	if len(events) == 0 {
		return ""
	}
	if limit <= 0 {
		limit = 5
	}
	parts := make([]string, 0, limit)
	for i, event := range events {
		if i >= limit {
			break
		}
		message := strings.TrimSpace(event.Message)
		if message == "" {
			message = strings.TrimSpace(event.Reason)
		}
		parts = append(parts, message)
	}
	return strings.Join(parts, " | ")
}

func formatLogSnippet(logs string, maxLines int, maxChars int) string {
	lines := strings.Split(strings.TrimSpace(logs), "\n")
	if len(lines) > maxLines {
		lines = lines[len(lines)-maxLines:]
	}
	snippet := strings.Join(lines, "\n")
	return truncateString(snippet, maxChars)
}

func truncateString(value string, maxChars int) string {
	if maxChars <= 0 || len(value) <= maxChars {
		return value
	}
	return value[:maxChars] + "...(truncated)"
}

func indentString(value, indent string) string {
	if value == "" {
		return ""
	}
	lines := strings.Split(value, "\n")
	for i := range lines {
		lines[i] = indent + lines[i]
	}
	return strings.Join(lines, "\n")
}
