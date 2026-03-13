package httpapi

import (
	"context"
	"net/http"
	"strings"

	"kubelens-backend/internal/ai"
	"kubelens-backend/internal/diagnostics"
	"kubelens-backend/internal/model"
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
