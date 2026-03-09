package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"

	"kubelens-backend/internal/ai"
	"kubelens-backend/internal/diagnostics"
	"kubelens-backend/internal/model"
)

var diagnoseRegex = regexp.MustCompile(`(?i)diagnose\s+([a-z0-9-]+)`)

var (
	defaultHints = []string{
		"Diagnose payment-gateway",
		"Show cluster health",
		"Generate deployment manifest",
	}
	healthHints = []string{
		"Show failed pods",
		"Show node risks",
		"Diagnose payment-gateway",
	}
)

type assistantRequest struct {
	Message   string `json:"message"`
	Namespace string `json:"namespace,omitempty"`
}

type assistantIntent int

const (
	intentUnknown assistantIntent = iota
	intentDiagnose
	intentManifest
	intentHealth
	intentPriority
)

func (s *Server) handleAssistant(w http.ResponseWriter, r *http.Request) {
	var req assistantRequest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	message := strings.TrimSpace(req.Message)
	if message == "" {
		writeError(w, http.StatusBadRequest, "message is required")
		return
	}
	namespace := strings.TrimSpace(req.Namespace)

	pods, nodes := s.cluster.Snapshot(r.Context())
	if namespace != "" {
		pods = filterPodsByNamespace(pods, namespace)
	}
	report := s.runDiagnostics(r.Context())
	diag := s.mapDiagnosticsReport(report)
	lower := strings.ToLower(message)
	docRefs := s.retrieveDocReferences(r.Context(), message, diag.Summary)
	diagnosticBriefs := mapDiagnosticsForAI(report.Diagnostics)
	assistantPromptContext := BuildAssistantContext(
		r.Context(),
		message,
		namespace,
		s.cluster,
		diagnosticsReaderFunc(func(context.Context) (model.DiagnosticsResult, error) {
			return diag, nil
		}),
	)
	clusterContext := assistantPromptContext.FormatForPrompt()
	groundedResources := assistantPromptContext.ReferencedResources()
	mergeResources := func(resources ...string) []string {
		out := make([]string, 0, len(resources)+len(groundedResources))
		out = append(out, resources...)
		out = append(out, groundedResources...)
		return dedupeStrings(out)
	}

	if match := diagnoseRegex.FindStringSubmatch(lower); len(match) == 2 {
		hint := match[1]
		pod, ok := findPodByHint(pods, hint)
		if !ok {
			s.writeAssistantResponse(w, r.Context(), assistantContext{
				intent:             "diagnose",
				userMessage:        message,
				localAnswer:        "I could not find a pod matching `" + hint + "`. Try a fuller pod name from the Pods tab.",
				hints:              []string{"Diagnose payment-gateway", "Show cluster health", "What should I fix first"},
				resources:          mergeResources(),
				docReferences:      docRefs,
				diagnosticsSummary: diag.Summary,
				diagnostics:        diag,
				diagnosticBriefs:   diagnosticBriefs,
				priorityActions:    diagnostics.BuildPriorityActions(diag),
				pods:               pods,
				nodes:              nodes,
				promptContext:      clusterContext,
			})
			return
		}

		events := s.cluster.PodEvents(r.Context(), pod.Namespace, pod.Name)
		logs := s.cluster.PodLogs(r.Context(), pod.Namespace, pod.Name, "", 50)
		targetDiagnostics := filterDiagnosticsForResource(diagnosticBriefs, pod.Namespace, pod.Name)
		answer := ""
		if len(targetDiagnostics) > 0 {
			answer = ai.ExplainDiagnostics(targetDiagnostics)
		} else {
			analysis := diagnostics.DiagnosePodIssue(pod, events, logs)
			answer = diagnostics.BuildPodDiagnosisMessage(pod, analysis)
		}

		s.writeAssistantResponse(w, r.Context(), assistantContext{
			intent:             "diagnose",
			userMessage:        message,
			localAnswer:        answer,
			hints:              []string{"Show failed pods", "Show node risks", "Generate deployment manifest"},
			resources:          mergeResources(pod.Namespace + "/" + pod.Name),
			docReferences:      docRefs,
			diagnosticsSummary: diag.Summary,
			diagnostics:        diag,
			diagnosticBriefs:   diagnosticBriefs,
			priorityActions:    diagnostics.BuildPriorityActions(diag),
			pods:               pods,
			nodes:              nodes,
			promptContext:      clusterContext,
		})
		return
	}

	switch detectIntent(lower) {
	case intentManifest:
		s.writeAssistantResponse(w, r.Context(), assistantContext{
			intent:             "manifest",
			userMessage:        message,
			localAnswer:        "Here is a production-safe starter deployment template:\n\n" + diagnostics.GenerateManifestTemplate(),
			hints:              defaultHints,
			resources:          mergeResources(),
			docReferences:      docRefs,
			diagnosticsSummary: diag.Summary,
			diagnostics:        diag,
			diagnosticBriefs:   diagnosticBriefs,
			priorityActions:    diagnostics.BuildPriorityActions(diag),
			pods:               pods,
			nodes:              nodes,
			promptContext:      clusterContext,
		})
		return
	case intentHealth:
		s.writeAssistantResponse(w, r.Context(), assistantContext{
			intent:             "health",
			userMessage:        message,
			localAnswer:        report.Summary,
			hints:              healthHints,
			resources:          mergeResources(collectIssueResources(diag.Issues)...),
			docReferences:      docRefs,
			diagnosticsSummary: diag.Summary,
			diagnostics:        diag,
			diagnosticBriefs:   diagnosticBriefs,
			priorityActions:    diagnostics.BuildPriorityActions(diag),
			pods:               pods,
			nodes:              nodes,
			promptContext:      clusterContext,
		})
		return
	case intentPriority:
		s.writeAssistantResponse(w, r.Context(), assistantContext{
			intent:             "priority",
			userMessage:        message,
			localAnswer:        diagnostics.BuildPriorityActions(diag),
			hints:              defaultHints,
			resources:          mergeResources(collectIssueResources(diag.Issues)...),
			docReferences:      docRefs,
			diagnosticsSummary: diag.Summary,
			diagnostics:        diag,
			diagnosticBriefs:   diagnosticBriefs,
			priorityActions:    diagnostics.BuildPriorityActions(diag),
			pods:               pods,
			nodes:              nodes,
			promptContext:      clusterContext,
		})
		return
	default:
		s.writeAssistantResponse(w, r.Context(), assistantContext{
			intent:      "general",
			userMessage: message,
			localAnswer: strings.Join([]string{
				"I can help with cluster operations using live data from this dashboard.",
				"",
				"Try one of these:",
				"- `Diagnose payment-gateway`",
				"- `Show cluster health`",
				"- `Show failed pods`",
				"- `Generate deployment manifest`",
			}, "\n"),
			hints:              defaultHints,
			resources:          mergeResources(),
			docReferences:      docRefs,
			diagnosticsSummary: diag.Summary,
			diagnostics:        diag,
			diagnosticBriefs:   diagnosticBriefs,
			priorityActions:    diagnostics.BuildPriorityActions(diag),
			pods:               pods,
			nodes:              nodes,
			promptContext:      clusterContext,
		})
	}
}

type assistantContext struct {
	intent             string
	userMessage        string
	localAnswer        string
	hints              []string
	resources          []string
	docReferences      []model.DocumentationReference
	diagnosticsSummary string
	diagnostics        model.DiagnosticsResult
	diagnosticBriefs   []ai.DiagnosticBrief
	priorityActions    string
	pods               []model.PodSummary
	nodes              []model.NodeSummary
	promptContext      string
}

func (s *Server) writeAssistantResponse(w http.ResponseWriter, reqCtx context.Context, ctx assistantContext) {
	answer := strings.TrimSpace(ctx.localAnswer)
	if s.ai != nil {
		if enhanced, err := s.enhanceAssistantAnswer(reqCtx, ctx); err == nil && strings.TrimSpace(enhanced) != "" {
			answer = enhanced
		} else if err != nil && s.logger != nil {
			s.logger.Warn("assistant provider fallback",
				"provider", s.aiName(),
				"error", err.Error(),
			)
		}
	}

	writeJSON(w, http.StatusOK, s.assistantResponse(answer, ctx.hints, ctx.resources, ctx.docReferences))
}

func (s *Server) enhanceAssistantAnswer(ctx context.Context, c assistantContext) (string, error) {
	if s.ai == nil {
		return "", fmt.Errorf("provider not configured")
	}

	timeoutCtx, cancel := context.WithTimeout(ctx, s.aiTTL)
	defer cancel()

	enrichedContext := s.buildEnrichedContext(timeoutCtx, c)
	in := ai.Input{
		UserMessage:          c.userMessage,
		Intent:               c.intent,
		SystemContext:        c.promptContext,
		LocalAnswer:          c.localAnswer,
		DiagnosticsSummary:   c.diagnosticsSummary,
		Diagnostics:          c.diagnosticBriefs,
		PriorityActions:      c.priorityActions,
		ReferencedResources:  dedupeStrings(c.resources),
		ClusterSnapshotBrief: buildClusterSnapshotBrief(c.pods, c.nodes),
		DocumentationContext: buildDocumentationContext(c.docReferences),
		DocumentationRefs:    mapDocReferencesForAI(c.docReferences),
		EnrichedContext:      enrichedContext,
	}

	if toolingProvider, ok := s.ai.(ai.ToolingProvider); ok {
		return s.generateAssistantWithTools(timeoutCtx, toolingProvider, in)
	}

	answer, err := s.ai.Generate(timeoutCtx, in)
	if err != nil {
		return "", err
	}
	return answer, nil
}

func (s *Server) aiName() string {
	if s.ai == nil {
		return "none"
	}
	return s.ai.Name()
}

func buildClusterSnapshotBrief(pods []model.PodSummary, nodes []model.NodeSummary) string {
	var running, pending, failed int
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

	var ready, notReady int
	for _, node := range nodes {
		if node.Status == model.NodeStatusReady {
			ready++
		}
		if node.Status == model.NodeStatusNotReady {
			notReady++
		}
	}

	return fmt.Sprintf(
		"pods=%d (running=%d pending=%d failed=%d), nodes=%d (ready=%d notReady=%d)",
		len(pods), running, pending, failed, len(nodes), ready, notReady,
	)
}

func dedupeStrings(values []string) []string {
	if len(values) == 0 {
		return nil
	}

	out := make([]string, 0, len(values))
	for _, v := range values {
		if strings.TrimSpace(v) == "" {
			continue
		}
		if slices.Contains(out, v) {
			continue
		}
		out = append(out, v)
	}
	return out
}

func (s *Server) assistantResponse(
	answer string,
	hints []string,
	resources []string,
	docRefs []model.DocumentationReference,
) model.AssistantResponse {
	return model.AssistantResponse{
		Answer:              answer,
		Hints:               append([]string(nil), hints...),
		ReferencedResources: append([]string(nil), resources...),
		References:          append([]model.DocumentationReference(nil), docRefs...),
		Timestamp:           s.now().UTC().Format(time.RFC3339),
	}
}

func (s *Server) retrieveDocReferences(ctx context.Context, message, diagnosticsSummary string) []model.DocumentationReference {
	if s.docs == nil || !s.docs.Enabled() {
		return nil
	}
	query := strings.TrimSpace(message)
	if query == "" {
		query = "kubernetes troubleshooting"
	}
	if strings.TrimSpace(diagnosticsSummary) != "" {
		query += " " + diagnosticsSummary
	}

	refs := s.docs.Retrieve(ctx, query, 3)
	if len(refs) == 0 {
		return nil
	}
	return refs
}

func mapDocReferencesForAI(refs []model.DocumentationReference) []ai.DocReference {
	out := make([]ai.DocReference, 0, len(refs))
	for _, ref := range refs {
		out = append(out, ai.DocReference{
			Title:   ref.Title,
			URL:     ref.URL,
			Source:  ref.Source,
			Snippet: ref.Snippet,
		})
	}
	return out
}

func buildDocumentationContext(refs []model.DocumentationReference) string {
	if len(refs) == 0 {
		return "No documentation snippets available."
	}

	lines := make([]string, 0, len(refs))
	for _, ref := range refs {
		if strings.TrimSpace(ref.Snippet) == "" {
			continue
		}
		lines = append(lines, fmt.Sprintf("[%s] %s", ref.Title, ref.Snippet))
	}
	if len(lines) == 0 {
		return "References available without snippets."
	}
	return strings.Join(lines, "\n")
}

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

const (
	toolGetPodDetails  = "get_pod_details"
	toolGetPodLogs     = "get_pod_logs"
	toolGetNodeState   = "get_node_state"
	toolGetEvents      = "get_events"
	toolRunDiagnostics = "run_diagnostics"
)

var assistantTools = []ai.ToolDefinition{
	{
		Name:        toolGetPodDetails,
		Description: "Get pod details, including status, containers, and node placement.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"namespace": map[string]any{"type": "string", "description": "Pod namespace"},
				"name":      map[string]any{"type": "string", "description": "Pod name"},
			},
			"required": []string{"namespace", "name"},
		},
	},
	{
		Name:        toolGetPodLogs,
		Description: "Fetch recent pod logs for a specific container.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"namespace": map[string]any{"type": "string", "description": "Pod namespace"},
				"name":      map[string]any{"type": "string", "description": "Pod name"},
				"container": map[string]any{"type": "string", "description": "Container name (optional)"},
				"lines":     map[string]any{"type": "integer", "description": "Number of log lines (default 50)"},
			},
			"required": []string{"namespace", "name"},
		},
	},
	{
		Name:        toolGetNodeState,
		Description: "Get node detail and conditions.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"name": map[string]any{"type": "string", "description": "Node name"},
			},
			"required": []string{"name"},
		},
	},
	{
		Name:        toolGetEvents,
		Description: "Fetch recent events. Provide namespace+name to scope to a pod, or leave blank for cluster events.",
		Parameters: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"namespace": map[string]any{"type": "string", "description": "Namespace (optional)"},
				"name":      map[string]any{"type": "string", "description": "Pod name (optional)"},
				"limit":     map[string]any{"type": "integer", "description": "Max events to return (default 10)"},
			},
		},
	},
	{
		Name:        toolRunDiagnostics,
		Description: "Run deterministic diagnostics on the current cluster snapshot.",
		Parameters: map[string]any{
			"type":       "object",
			"properties": map[string]any{},
		},
	},
}

func (s *Server) generateAssistantWithTools(ctx context.Context, provider ai.ToolingProvider, in ai.Input) (string, error) {
	messages := []ai.ChatMessage{
		{Role: "system", Content: ai.SystemPromptWithContext(in.SystemContext)},
		{Role: "user", Content: ai.UserPrompt(in)},
	}

	const maxIterations = 4
	for i := 0; i < maxIterations; i++ {
		resp, err := provider.Chat(ctx, ai.ChatRequest{
			Messages: messages,
			Tools:    assistantTools,
		})
		if err != nil {
			return "", err
		}

		if len(resp.ToolCalls) == 0 {
			if strings.TrimSpace(resp.Content) == "" {
				return "", fmt.Errorf("assistant returned empty response")
			}
			return resp.Content, nil
		}

		messages = append(messages, ai.ChatMessage{
			Role:      "assistant",
			Content:   resp.Content,
			ToolCalls: resp.ToolCalls,
		})

		for _, call := range resp.ToolCalls {
			result := s.executeAssistantTool(ctx, call)
			messages = append(messages, ai.ChatMessage{
				Role:       "tool",
				ToolCallID: call.ID,
				Content:    result,
			})
		}
	}

	return "", fmt.Errorf("assistant tool loop exceeded %d iterations", maxIterations)
}

func (s *Server) executeAssistantTool(ctx context.Context, call ai.ToolCall) string {
	switch call.Name {
	case toolGetPodDetails:
		var args struct {
			Namespace string `json:"namespace"`
			Name      string `json:"name"`
		}
		if err := json.Unmarshal([]byte(call.Arguments), &args); err != nil {
			return marshalToolError("invalid arguments", err)
		}
		pod, err := s.cluster.PodDetail(ctx, args.Namespace, args.Name)
		if err != nil {
			return marshalToolError("pod detail failed", err)
		}
		return marshalToolResult(pod)
	case toolGetPodLogs:
		var args struct {
			Namespace string `json:"namespace"`
			Name      string `json:"name"`
			Container string `json:"container"`
			Lines     int    `json:"lines"`
		}
		if err := json.Unmarshal([]byte(call.Arguments), &args); err != nil {
			return marshalToolError("invalid arguments", err)
		}
		lines := args.Lines
		if lines <= 0 {
			lines = 50
		}
		logs := s.cluster.PodLogs(ctx, args.Namespace, args.Name, strings.TrimSpace(args.Container), lines)
		return marshalToolResult(map[string]string{"logs": truncateString(logs, 4000)})
	case toolGetNodeState:
		var args struct {
			Name string `json:"name"`
		}
		if err := json.Unmarshal([]byte(call.Arguments), &args); err != nil {
			return marshalToolError("invalid arguments", err)
		}
		node, err := s.cluster.NodeDetail(ctx, args.Name)
		if err != nil {
			return marshalToolError("node detail failed", err)
		}
		return marshalToolResult(node)
	case toolGetEvents:
		var args struct {
			Namespace string `json:"namespace"`
			Name      string `json:"name"`
			Limit     int    `json:"limit"`
		}
		if err := json.Unmarshal([]byte(call.Arguments), &args); err != nil {
			return marshalToolError("invalid arguments", err)
		}
		limit := args.Limit
		if limit <= 0 {
			limit = 10
		}
		var events []model.K8sEvent
		if strings.TrimSpace(args.Namespace) != "" && strings.TrimSpace(args.Name) != "" {
			events = s.cluster.PodEvents(ctx, args.Namespace, args.Name)
		} else {
			events = s.cluster.ListClusterEvents(ctx)
		}
		if len(events) > limit {
			events = events[:limit]
		}
		return marshalToolResult(events)
	case toolRunDiagnostics:
		pods, nodes := s.cluster.Snapshot(ctx)
		return marshalToolResult(diagnostics.BuildDiagnostics(pods, nodes))
	default:
		return marshalToolError("unknown tool", fmt.Errorf("tool %s not supported", call.Name))
	}
}

func marshalToolResult(data any) string {
	payload, err := json.Marshal(map[string]any{
		"ok":   true,
		"data": data,
	})
	if err != nil {
		return `{"ok":false,"error":"failed to encode tool result"}`
	}
	return string(payload)
}

func marshalToolError(message string, err error) string {
	payload, _ := json.Marshal(map[string]any{
		"ok":    false,
		"error": message + ": " + err.Error(),
	})
	return string(payload)
}

func detectIntent(lowerMessage string) assistantIntent {
	switch {
	case strings.Contains(lowerMessage, "manifest"),
		strings.Contains(lowerMessage, "yaml"),
		strings.Contains(lowerMessage, "deployment"):
		return intentManifest
	case strings.Contains(lowerMessage, "health"),
		strings.Contains(lowerMessage, "status"),
		strings.Contains(lowerMessage, "summary"):
		return intentHealth
	case strings.Contains(lowerMessage, "failed"),
		strings.Contains(lowerMessage, "pending"),
		strings.Contains(lowerMessage, "not ready"),
		strings.Contains(lowerMessage, "priority"):
		return intentPriority
	default:
		return intentUnknown
	}
}

func findPodByHint(pods []model.PodSummary, hint string) (model.PodSummary, bool) {
	needle := strings.ToLower(strings.TrimSpace(hint))
	for _, pod := range pods {
		if strings.EqualFold(pod.Name, needle) {
			return pod, true
		}
	}
	for _, pod := range pods {
		if strings.Contains(strings.ToLower(pod.Name), needle) {
			return pod, true
		}
	}
	return model.PodSummary{}, false
}

func collectIssueResources(issues []model.DiagnosticIssue) []string {
	out := make([]string, 0, len(issues))
	for _, issue := range issues {
		if issue.Resource != "" {
			out = append(out, issue.Resource)
		}
	}
	return out
}
