package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"sort"
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
	groundedResources := assistantPromptContext.ReferencedResources()
	clusterContext := assistantPromptContext.FormatForPrompt()
	if memoryContext := s.buildTeamRunbookContext(message, groundedResources); strings.TrimSpace(memoryContext) != "" {
		if strings.TrimSpace(clusterContext) == "" {
			clusterContext = memoryContext
		} else {
			clusterContext = clusterContext + "\n\n" + memoryContext
		}
	}
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

	summary := strings.TrimSpace(answer)
	if len(summary) > 320 {
		summary = summary[:320] + "..."
	}
	if summary != "" {
		s.notifyChatOps(func(chatCtx context.Context) {
			if s.chatops != nil {
				s.chatops.NotifyAssistantFinding(chatCtx, summary, ctx.resources)
			}
		})
	}
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

	queries := buildDocsQueries(message, diagnosticsSummary)
	if len(queries) == 0 {
		queries = []string{"kubernetes troubleshooting"}
	}

	const refLimit = 3
	seen := make(map[string]struct{}, refLimit*2)
	refs := make([]model.DocumentationReference, 0, refLimit)

	for _, query := range queries {
		candidates := s.docs.Retrieve(ctx, query, refLimit)
		for _, candidate := range candidates {
			url := strings.TrimSpace(candidate.URL)
			if url == "" {
				continue
			}
			if _, exists := seen[url]; exists {
				continue
			}
			seen[url] = struct{}{}
			refs = append(refs, candidate)
			if len(refs) >= refLimit {
				return refs
			}
		}
	}

	if len(refs) == 0 {
		return nil
	}
	return refs
}

var (
	docQueryTokenPattern = regexp.MustCompile(`[a-z0-9][a-z0-9\-./_]{2,}`)
	docQueryStopWords    = map[string]struct{}{
		"the": {}, "and": {}, "for": {}, "with": {}, "this": {}, "that": {}, "from": {}, "into": {}, "about": {},
		"show": {}, "please": {}, "need": {}, "help": {}, "could": {}, "would": {}, "should": {}, "kubernetes": {},
		"cluster": {}, "issue": {}, "issues": {}, "problem": {}, "problems": {}, "summary": {}, "diagnostics": {},
	}
)

func buildDocsQueries(message, diagnosticsSummary string) []string {
	out := make([]string, 0, 4)
	seen := map[string]struct{}{}
	appendQuery := func(value string) {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return
		}
		key := strings.ToLower(trimmed)
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		out = append(out, trimmed)
	}

	message = strings.TrimSpace(message)
	diagnosticsSummary = strings.TrimSpace(diagnosticsSummary)
	messageTerms := extractDocKeywords(message, 8)
	diagnosticsTerms := extractDocKeywords(diagnosticsSummary, 10)

	appendQuery(message)
	if len(messageTerms) > 0 && len(diagnosticsTerms) > 0 {
		appendQuery(strings.Join(append(append([]string{}, messageTerms...), diagnosticsTerms...), " "))
	}
	if len(diagnosticsTerms) > 0 {
		appendQuery(strings.Join(diagnosticsTerms, " "))
	}
	if len(messageTerms) > 0 {
		appendQuery(strings.Join(messageTerms, " "))
	}

	return out
}

func extractDocKeywords(input string, limit int) []string {
	if limit <= 0 {
		return nil
	}
	raw := docQueryTokenPattern.FindAllString(strings.ToLower(input), -1)
	if len(raw) == 0 {
		return nil
	}

	out := make([]string, 0, limit)
	seen := make(map[string]struct{}, limit)
	for _, token := range raw {
		if len(token) <= 2 {
			continue
		}
		if _, excluded := docQueryStopWords[token]; excluded {
			continue
		}
		if _, exists := seen[token]; exists {
			continue
		}
		seen[token] = struct{}{}
		out = append(out, token)
		if len(out) >= limit {
			break
		}
	}
	return out
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

func (s *Server) buildTeamRunbookContext(query string, resources []string) string {
	if s.memory == nil {
		return ""
	}

	runbookByID := make(map[string]model.MemoryRunbook, 8)
	runbookOrder := make([]string, 0, 8)
	appendRunbooks := func(searchQuery string) {
		if strings.TrimSpace(searchQuery) == "" {
			return
		}
		for _, runbook := range s.memory.Search(searchQuery) {
			if strings.TrimSpace(runbook.ID) == "" {
				continue
			}
			if _, exists := runbookByID[runbook.ID]; exists {
				continue
			}
			runbookByID[runbook.ID] = runbook
			runbookOrder = append(runbookOrder, runbook.ID)
			if len(runbookOrder) >= 5 {
				return
			}
		}
	}

	appendRunbooks(query)
	for _, resource := range resources {
		if len(runbookOrder) >= 5 {
			break
		}
		trimmed := strings.TrimSpace(resource)
		if trimmed == "" {
			continue
		}
		appendRunbooks(trimmed)
		if parts := strings.Split(trimmed, "/"); len(parts) > 0 {
			appendRunbooks(parts[len(parts)-1])
		}
	}

	relevantFixes := selectRelevantFixes(s.memory.ListFixes(), query, resources, 3)
	if len(runbookOrder) == 0 && len(relevantFixes) == 0 {
		return ""
	}

	var sb strings.Builder
	if len(runbookOrder) > 0 {
		sb.WriteString("## TEAM RUNBOOKS\n")
	}
	for _, runbookID := range runbookOrder {
		runbook := runbookByID[runbookID]
		s.memory.IncrementUsage(runbook.ID)

		sb.WriteString("- Title: ")
		sb.WriteString(strings.TrimSpace(runbook.Title))
		sb.WriteString("\n")
		tags := strings.Join(runbook.Tags, ", ")
		if strings.TrimSpace(tags) == "" {
			tags = "none"
		}
		sb.WriteString("  Tags: ")
		sb.WriteString(tags)
		sb.WriteString("\n")
		if desc := strings.TrimSpace(runbook.Description); desc != "" {
			sb.WriteString("  Description: ")
			sb.WriteString(desc)
			sb.WriteString("\n")
		}
		sb.WriteString("  Steps:\n")
		for i, step := range runbook.Steps {
			if i >= 6 {
				sb.WriteString("  ... additional steps omitted\n")
				break
			}
			sb.WriteString(fmt.Sprintf("  %d. %s\n", i+1, strings.TrimSpace(step)))
		}
	}

	if len(relevantFixes) > 0 {
		if sb.Len() > 0 {
			sb.WriteString("\n")
		}
		sb.WriteString("## TEAM FIX PATTERNS\n")
		for _, fix := range relevantFixes {
			sb.WriteString("- Title: ")
			sb.WriteString(strings.TrimSpace(fix.Title))
			sb.WriteString("\n")
			sb.WriteString("  Kind: ")
			sb.WriteString(string(fix.Kind))
			sb.WriteString("\n")
			if resource := strings.TrimSpace(fix.Resource); resource != "" {
				sb.WriteString("  Resource: ")
				sb.WriteString(resource)
				sb.WriteString("\n")
			}
			if desc := strings.TrimSpace(fix.Description); desc != "" {
				sb.WriteString("  Description: ")
				sb.WriteString(desc)
				sb.WriteString("\n")
			}
		}
	}

	return strings.TrimSpace(sb.String())
}

func selectRelevantFixes(
	fixes []model.MemoryFixPattern,
	query string,
	resources []string,
	limit int,
) []model.MemoryFixPattern {
	if len(fixes) == 0 || limit <= 0 {
		return nil
	}

	queryLower := strings.ToLower(strings.TrimSpace(query))
	resourceSet := make(map[string]struct{}, len(resources))
	for _, resource := range resources {
		trimmed := strings.ToLower(strings.TrimSpace(resource))
		if trimmed == "" {
			continue
		}
		resourceSet[trimmed] = struct{}{}
	}

	type scoredFix struct {
		fix   model.MemoryFixPattern
		score int
	}
	scored := make([]scoredFix, 0, len(fixes))
	for _, fix := range fixes {
		score := 0
		title := strings.ToLower(strings.TrimSpace(fix.Title))
		description := strings.ToLower(strings.TrimSpace(fix.Description))
		resource := strings.ToLower(strings.TrimSpace(fix.Resource))
		kind := strings.ToLower(strings.TrimSpace(string(fix.Kind)))

		if queryLower != "" {
			if strings.Contains(title, queryLower) {
				score += 8
			}
			if strings.Contains(description, queryLower) {
				score += 5
			}
			if strings.Contains(resource, queryLower) {
				score += 6
			}
			if strings.Contains(kind, queryLower) {
				score += 4
			}
		}
		for resourceHint := range resourceSet {
			if resourceHint == resource {
				score += 10
				continue
			}
			if strings.Contains(resource, resourceHint) || strings.Contains(resourceHint, resource) {
				score += 6
			}
		}

		if queryLower != "" || len(resourceSet) > 0 {
			if score == 0 {
				continue
			}
		}
		scored = append(scored, scoredFix{fix: fix, score: score})
	}

	if len(scored) == 0 {
		return nil
	}

	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].score != scored[j].score {
			return scored[i].score > scored[j].score
		}
		return scored[i].fix.RecordedAt > scored[j].fix.RecordedAt
	})

	if len(scored) > limit {
		scored = scored[:limit]
	}
	out := make([]model.MemoryFixPattern, 0, len(scored))
	for _, item := range scored {
		out = append(out, item.fix)
	}
	return out
}
