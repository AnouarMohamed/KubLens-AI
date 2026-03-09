package httpapi

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"kubelens-backend/internal/model"
)

const (
	assistantMaxPodRows      = 25
	assistantMaxNodeRows     = 12
	assistantMaxWarningEvent = 15
	assistantMaxLogPods      = 2
	assistantLogLines        = 50
)

type DiagnosticsReader interface {
	GetDiagnostics(ctx context.Context) (model.DiagnosticsResult, error)
}

type diagnosticsReaderFunc func(ctx context.Context) (model.DiagnosticsResult, error)

func (f diagnosticsReaderFunc) GetDiagnostics(ctx context.Context) (model.DiagnosticsResult, error) {
	return f(ctx)
}

type AssistantContext struct {
	Query       string
	Namespace   string
	Pods        []model.PodSummary
	Events      []model.K8sEvent
	Nodes       []model.NodeSummary
	Diagnostics *model.DiagnosticsResult
	LogLines    map[string]string // "<namespace>/<pod>" -> tail logs
}

// BuildAssistantContext parses intent from the query and gathers deterministic cluster context.
func BuildAssistantContext(
	ctx context.Context,
	query string,
	namespace string,
	cluster ClusterReader,
	diag DiagnosticsReader,
) AssistantContext {
	ns := strings.TrimSpace(namespace)
	query = strings.TrimSpace(query)
	queryLower := strings.ToLower(query)

	out := AssistantContext{
		Query:     query,
		Namespace: ns,
	}

	if diag != nil {
		if result, err := diag.GetDiagnostics(ctx); err == nil {
			clone := result
			out.Diagnostics = &clone
		}
	}

	mentionsPods := containsAny(queryLower, "pod", "container", "crash", "restart", "oomkill", "pending", "failed", "log")
	mentionsNodes := containsAny(queryLower, "node", "pressure", "notready", "not ready", "evict", "memory pressure", "disk pressure")
	mentionsEvents := containsAny(queryLower, "event", "warning", "backoff", "error")
	mentionsLogs := containsAny(queryLower, "log", "tail", "stream")

	pods, nodes := cluster.Snapshot(ctx)
	if mentionsPods || mentionsEvents || mentionsLogs || ns != "" {
		out.Pods = filterPodsByNamespace(pods, ns)
	}
	if mentionsNodes || containsAny(queryLower, "cluster health", "overall health") {
		out.Nodes = nodes
	}

	if mentionsPods || mentionsEvents || mentionsLogs {
		events := cluster.ListClusterEvents(ctx)
		if len(out.Pods) > 0 {
			events = filterEventsForPods(events, out.Pods)
		}
		out.Events = events
	}

	if mentionsLogs && len(out.Pods) > 0 {
		out.LogLines = make(map[string]string, assistantMaxLogPods)
		for _, pod := range selectPodsForLogs(out.Pods, queryLower) {
			key := pod.Namespace + "/" + pod.Name
			logs := strings.TrimSpace(cluster.PodLogs(ctx, pod.Namespace, pod.Name, "", assistantLogLines))
			if logs == "" {
				continue
			}
			out.LogLines[key] = logs
		}
	}

	return out
}

// FormatForPrompt serializes deterministic context into stable prompt sections.
func (ac AssistantContext) FormatForPrompt() string {
	var sb strings.Builder

	if ac.Diagnostics != nil {
		sb.WriteString("## DIAGNOSTICS ENGINE OUTPUT\n")
		sb.WriteString(fmt.Sprintf("Health score: %d/100\n", ac.Diagnostics.HealthScore))
		sb.WriteString(fmt.Sprintf("Critical issues: %d | Warnings: %d\n\n", ac.Diagnostics.CriticalIssues, ac.Diagnostics.WarningIssues))
		for _, issue := range ac.Diagnostics.Issues {
			sb.WriteString(fmt.Sprintf("[%s] %s", strings.ToUpper(string(issue.Severity)), issue.Message))
			if issue.Resource != "" {
				sb.WriteString(fmt.Sprintf(" (%s)", issue.Resource))
			}
			sb.WriteString("\n")
			if detail := strings.TrimSpace(strings.Join(issue.Evidence, " | ")); detail != "" {
				sb.WriteString(fmt.Sprintf("  Detail: %s\n", detail))
			}
			sb.WriteString(fmt.Sprintf("  Action: %s\n\n", issue.Recommendation))
		}
	}

	if len(ac.Pods) > 0 {
		sb.WriteString("## LIVE POD STATE\n")
		for i, pod := range ac.Pods {
			if i >= assistantMaxPodRows {
				sb.WriteString(fmt.Sprintf("- ... %d additional pods omitted\n", len(ac.Pods)-assistantMaxPodRows))
				break
			}
			sb.WriteString(fmt.Sprintf(
				"- %s/%s status=%s cpu=%s mem=%s restarts=%d age=%s\n",
				pod.Namespace,
				pod.Name,
				pod.Status,
				pod.CPU,
				pod.Memory,
				pod.Restarts,
				pod.Age,
			))
		}
		sb.WriteString("\n")
	}

	if len(ac.Nodes) > 0 {
		sb.WriteString("## LIVE NODE STATE\n")
		for i, node := range ac.Nodes {
			if i >= assistantMaxNodeRows {
				sb.WriteString(fmt.Sprintf("- ... %d additional nodes omitted\n", len(ac.Nodes)-assistantMaxNodeRows))
				break
			}
			sb.WriteString(fmt.Sprintf("- %s status=%s cpu=%s mem=%s\n", node.Name, node.Status, node.CPUUsage, node.MemUsage))
		}
		sb.WriteString("\n")
	}

	if len(ac.Events) > 0 {
		sb.WriteString("## RECENT CLUSTER EVENTS (warnings only)\n")
		count := 0
		for _, event := range ac.Events {
			if !strings.EqualFold(strings.TrimSpace(event.Type), "warning") {
				continue
			}
			sb.WriteString(fmt.Sprintf("- [%s] %s: %s\n", event.Age, event.Reason, event.Message))
			count++
			if count >= assistantMaxWarningEvent {
				break
			}
		}
		if count == 0 {
			sb.WriteString("- none\n")
		}
		sb.WriteString("\n")
	}

	if len(ac.LogLines) > 0 {
		sb.WriteString("## POD LOG EXCERPTS\n")
		keys := make([]string, 0, len(ac.LogLines))
		for key := range ac.LogLines {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			sb.WriteString(fmt.Sprintf("- %s\n", key))
			sb.WriteString(indentString(truncateString(ac.LogLines[key], 1800), "  "))
			sb.WriteString("\n")
		}
		sb.WriteString("\n")
	}

	return strings.TrimSpace(sb.String())
}

func (ac AssistantContext) ReferencedResources() []string {
	out := make([]string, 0, 12)
	seen := map[string]struct{}{}
	add := func(value string) {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return
		}
		if _, exists := seen[trimmed]; exists {
			return
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}

	for _, pod := range ac.Pods {
		add(pod.Namespace + "/" + pod.Name)
		if len(out) >= 8 {
			return out
		}
	}
	for _, node := range ac.Nodes {
		add(node.Name)
		if len(out) >= 8 {
			return out
		}
	}
	if ac.Diagnostics != nil {
		for _, issue := range ac.Diagnostics.Issues {
			add(issue.Resource)
			if len(out) >= 8 {
				return out
			}
		}
	}
	return out
}

func containsAny(s string, terms ...string) bool {
	for _, term := range terms {
		if strings.Contains(s, term) {
			return true
		}
	}
	return false
}

func filterPodsByNamespace(pods []model.PodSummary, namespace string) []model.PodSummary {
	if strings.TrimSpace(namespace) == "" {
		return append([]model.PodSummary(nil), pods...)
	}
	out := make([]model.PodSummary, 0, len(pods))
	for _, pod := range pods {
		if strings.EqualFold(strings.TrimSpace(pod.Namespace), namespace) {
			out = append(out, pod)
		}
	}
	return out
}

func filterEventsForPods(events []model.K8sEvent, pods []model.PodSummary) []model.K8sEvent {
	if len(events) == 0 || len(pods) == 0 {
		return events
	}
	podNameSet := make(map[string]struct{}, len(pods))
	for _, pod := range pods {
		podNameSet[strings.ToLower(pod.Name)] = struct{}{}
	}

	out := make([]model.K8sEvent, 0, len(events))
	for _, event := range events {
		matched := false
		source := strings.ToLower(strings.TrimSpace(event.From))
		message := strings.ToLower(strings.TrimSpace(event.Message))
		for name := range podNameSet {
			if strings.Contains(source, name) || strings.Contains(message, name) {
				matched = true
				break
			}
		}
		if matched {
			out = append(out, event)
		}
	}
	if len(out) == 0 {
		return events
	}
	return out
}

func selectPodsForLogs(pods []model.PodSummary, queryLower string) []model.PodSummary {
	selected := make([]model.PodSummary, 0, assistantMaxLogPods)
	add := func(pod model.PodSummary) {
		for _, existing := range selected {
			if existing.Namespace == pod.Namespace && existing.Name == pod.Name {
				return
			}
		}
		selected = append(selected, pod)
	}

	for _, pod := range pods {
		if strings.Contains(queryLower, strings.ToLower(pod.Name)) {
			add(pod)
			if len(selected) >= assistantMaxLogPods {
				return selected
			}
		}
	}

	for _, pod := range pods {
		if pod.Restarts > 0 || pod.Status == model.PodStatusFailed || pod.Status == model.PodStatusPending {
			add(pod)
			if len(selected) >= assistantMaxLogPods {
				return selected
			}
		}
	}

	for _, pod := range pods {
		add(pod)
		if len(selected) >= assistantMaxLogPods {
			return selected
		}
	}
	return selected
}
