package httpapi

import (
	"context"
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
	Message string `json:"message"`
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
	if err := decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	message := strings.TrimSpace(req.Message)
	if message == "" {
		writeError(w, http.StatusBadRequest, "message is required")
		return
	}

	pods, nodes := s.cluster.Snapshot(r.Context())
	diag := diagnostics.BuildDiagnostics(pods, nodes)
	lower := strings.ToLower(message)
	docRefs := s.retrieveDocReferences(r.Context(), message, diag.Summary)

	if match := diagnoseRegex.FindStringSubmatch(lower); len(match) == 2 {
		hint := match[1]
		pod, ok := findPodByHint(pods, hint)
		if !ok {
			s.writeAssistantResponse(w, r.Context(), assistantContext{
				intent:             "diagnose",
				userMessage:        message,
				localAnswer:        "I could not find a pod matching `" + hint + "`. Try a fuller pod name from the Pods tab.",
				hints:              []string{"Diagnose payment-gateway", "Show cluster health", "What should I fix first"},
				resources:          nil,
				docReferences:      docRefs,
				diagnosticsSummary: diag.Summary,
				priorityActions:    diagnostics.BuildPriorityActions(diag),
				pods:               pods,
				nodes:              nodes,
			})
			return
		}

		events := s.cluster.PodEvents(r.Context(), pod.Namespace, pod.Name)
		logs := s.cluster.PodLogs(r.Context(), pod.Namespace, pod.Name)
		analysis := diagnostics.DiagnosePodIssue(pod, events, logs)
		answer := diagnostics.BuildPodDiagnosisMessage(pod, analysis)

		s.writeAssistantResponse(w, r.Context(), assistantContext{
			intent:             "diagnose",
			userMessage:        message,
			localAnswer:        answer,
			hints:              []string{"Show failed pods", "Show node risks", "Generate deployment manifest"},
			resources:          []string{pod.Namespace + "/" + pod.Name},
			docReferences:      docRefs,
			diagnosticsSummary: diag.Summary,
			priorityActions:    diagnostics.BuildPriorityActions(diag),
			pods:               pods,
			nodes:              nodes,
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
			resources:          nil,
			docReferences:      docRefs,
			diagnosticsSummary: diag.Summary,
			priorityActions:    diagnostics.BuildPriorityActions(diag),
			pods:               pods,
			nodes:              nodes,
		})
		return
	case intentHealth:
		s.writeAssistantResponse(w, r.Context(), assistantContext{
			intent:             "health",
			userMessage:        message,
			localAnswer:        diag.Summary,
			hints:              healthHints,
			resources:          collectIssueResources(diag.Issues),
			docReferences:      docRefs,
			diagnosticsSummary: diag.Summary,
			priorityActions:    diagnostics.BuildPriorityActions(diag),
			pods:               pods,
			nodes:              nodes,
		})
		return
	case intentPriority:
		s.writeAssistantResponse(w, r.Context(), assistantContext{
			intent:             "priority",
			userMessage:        message,
			localAnswer:        diagnostics.BuildPriorityActions(diag),
			hints:              defaultHints,
			resources:          collectIssueResources(diag.Issues),
			docReferences:      docRefs,
			diagnosticsSummary: diag.Summary,
			priorityActions:    diagnostics.BuildPriorityActions(diag),
			pods:               pods,
			nodes:              nodes,
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
			resources:          nil,
			docReferences:      docRefs,
			diagnosticsSummary: diag.Summary,
			priorityActions:    diagnostics.BuildPriorityActions(diag),
			pods:               pods,
			nodes:              nodes,
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
	priorityActions    string
	pods               []model.PodSummary
	nodes              []model.NodeSummary
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

	in := ai.Input{
		UserMessage:          c.userMessage,
		Intent:               c.intent,
		LocalAnswer:          c.localAnswer,
		DiagnosticsSummary:   c.diagnosticsSummary,
		PriorityActions:      c.priorityActions,
		ReferencedResources:  dedupeStrings(c.resources),
		ClusterSnapshotBrief: buildClusterSnapshotBrief(c.pods, c.nodes),
		DocumentationContext: buildDocumentationContext(c.docReferences),
		DocumentationRefs:    mapDocReferencesForAI(c.docReferences),
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
