package postmortem

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"kubelens-backend/internal/ai"
	"kubelens-backend/internal/model"
)

type AIEnricher interface {
	Generate(ctx context.Context, in ai.Input) (string, error)
}

func Generate(ctx context.Context, incident model.Incident, enricher AIEnricher, now func() time.Time) model.Postmortem {
	clock := now
	if clock == nil {
		clock = time.Now
	}
	generatedAt := clock().UTC()

	timeline := cloneTimeline(incident.Timeline)
	sort.SliceStable(timeline, func(i, j int) bool {
		return timeline[i].Timestamp < timeline[j].Timestamp
	})
	runbook := append([]model.RunbookStep(nil), incident.Runbook...)

	rootCause := deriveRootCause(incident, timeline)
	duration := formatDuration(incident.OpenedAt, incident.ResolvedAt)
	impact := buildImpactSummary(incident, duration)
	prevention := buildPreventionActions(timeline)
	timelineMarkdown := buildTimelineMarkdown(timeline)
	runbookMarkdown := buildRunbookMarkdown(runbook)

	method := model.PostmortemMethodTemplate
	if enricher != nil {
		if aiRoot, aiPrevention, ok := enrichWithAI(ctx, incident, rootCause, prevention, timelineMarkdown, runbookMarkdown, enricher); ok {
			rootCause = aiRoot
			prevention = aiPrevention
			method = model.PostmortemMethodAI
		}
	}

	return model.Postmortem{
		ID:               "",
		IncidentID:       strings.TrimSpace(incident.ID),
		IncidentTitle:    strings.TrimSpace(incident.Title),
		Severity:         strings.TrimSpace(incident.Severity),
		OpenedAt:         strings.TrimSpace(incident.OpenedAt),
		ResolvedAt:       strings.TrimSpace(incident.ResolvedAt),
		Duration:         duration,
		GeneratedAt:      generatedAt.Format(time.RFC3339),
		Method:           method,
		RootCause:        rootCause,
		Impact:           impact,
		Prevention:       prevention,
		TimelineMarkdown: timelineMarkdown,
		RunbookMarkdown:  runbookMarkdown,
		Timeline:         timeline,
		Runbook:          runbook,
	}
}

func enrichWithAI(
	ctx context.Context,
	incident model.Incident,
	templateRootCause string,
	templatePrevention string,
	timelineMarkdown string,
	runbookMarkdown string,
	enricher AIEnricher,
) (string, string, bool) {
	prompt := strings.Join([]string{
		"You are enriching a Kubernetes incident postmortem.",
		"Return strict JSON with shape:",
		`{"root_cause":"<single concise paragraph>","prevention_items":["item with owner and timeframe", "..."]}`,
		"Do not include markdown code fences.",
		"",
		"Incident title: " + incident.Title,
		"Severity: " + incident.Severity,
		"Opened: " + incident.OpenedAt,
		"Resolved: " + incident.ResolvedAt,
		"",
		"Template root cause:",
		templateRootCause,
		"",
		"Template prevention:",
		templatePrevention,
		"",
		"Timeline:",
		timelineMarkdown,
		"",
		"Runbook:",
		runbookMarkdown,
		"",
		"Provide 3-5 prevention items, each concrete, with owner and timeframe.",
	}, "\n")

	response, err := enricher.Generate(ctx, ai.Input{
		UserMessage:          prompt,
		Intent:               "postmortem_enrichment",
		SystemContext:        "Enhance postmortem root cause and prevention only.",
		LocalAnswer:          templateRootCause + "\n\n" + templatePrevention,
		DiagnosticsSummary:   incident.Summary,
		PriorityActions:      runbookMarkdown,
		ReferencedResources:  append([]string(nil), incident.AffectedResources...),
		ClusterSnapshotBrief: "Postmortem enrichment request",
		DocumentationContext: timelineMarkdown,
		DocumentationRefs:    nil,
		EnrichedContext:      "Only replace root cause and prevention sections.",
	})
	if err != nil {
		return "", "", false
	}

	var parsed struct {
		RootCause       string   `json:"root_cause"`
		PreventionItems []string `json:"prevention_items"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(response)), &parsed); err != nil {
		return "", "", false
	}

	rootCause := strings.TrimSpace(parsed.RootCause)
	if rootCause == "" {
		return "", "", false
	}

	items := make([]string, 0, len(parsed.PreventionItems))
	for _, item := range parsed.PreventionItems {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		items = append(items, trimmed)
	}
	if len(items) == 0 {
		return "", "", false
	}

	prevention := make([]string, 0, len(items))
	for _, item := range items {
		prevention = append(prevention, "- "+item)
	}
	return rootCause, strings.Join(prevention, "\n"), true
}

func deriveRootCause(incident model.Incident, timeline []model.TimelineEntry) string {
	for _, entry := range timeline {
		if entry.Kind == model.TimelineEntryKindDiagnostic && strings.EqualFold(strings.TrimSpace(entry.Severity), string(model.SeverityCritical)) {
			return strings.TrimSpace(entry.Summary)
		}
	}
	for _, entry := range timeline {
		if entry.Kind == model.TimelineEntryKindDiagnostic && strings.TrimSpace(entry.Summary) != "" {
			return strings.TrimSpace(entry.Summary)
		}
	}
	if strings.TrimSpace(incident.Summary) != "" {
		return strings.TrimSpace(incident.Summary)
	}
	return "Root cause could not be determined from the available deterministic evidence."
}

func buildImpactSummary(incident model.Incident, duration string) string {
	resourceCount := len(incident.AffectedResources)
	if resourceCount == 0 {
		return fmt.Sprintf("Incident duration was %s. No affected resources were explicitly captured.", duration)
	}
	resourceLabel := "resources"
	if resourceCount == 1 {
		resourceLabel = "resource"
	}
	return fmt.Sprintf(
		"Incident impacted %d %s over %s. Affected scope included: %s.",
		resourceCount,
		resourceLabel,
		duration,
		strings.Join(incident.AffectedResources, ", "),
	)
}

func buildPreventionActions(timeline []model.TimelineEntry) string {
	actions := make([]string, 0, 5)
	seen := map[string]struct{}{}

	add := func(key, value string) {
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		actions = append(actions, "- "+value)
	}

	for _, entry := range timeline {
		if entry.Kind != model.TimelineEntryKindDiagnostic {
			continue
		}
		summary := strings.ToLower(entry.Summary)
		switch {
		case strings.Contains(summary, "oom"):
			add("oom", "Owner: Platform Team (2 weeks) — set memory budgets and enforce regression tests for memory growth.")
		case strings.Contains(summary, "crash"):
			add("crash", "Owner: Service Team (1 week) — add startup dependency checks and alerting for repeated restarts.")
		case strings.Contains(summary, "not ready"), strings.Contains(summary, "node"):
			add("node", "Owner: SRE Team (1 week) — establish node health playbooks with automated cordon/escalation criteria.")
		case strings.Contains(summary, "pending"), strings.Contains(summary, "schedule"):
			add("scheduling", "Owner: Capacity Team (2 weeks) — tune requests/limits and quota alerts to reduce scheduling deadlocks.")
		default:
			add("general:"+summary, "Owner: On-call Rotation (1 week) — convert incident findings into a validated runbook and drill it monthly.")
		}
	}

	if len(actions) == 0 {
		actions = append(actions, "- Owner: On-call Rotation (1 week) — document deterministic diagnostics and validation steps for faster future response.")
	}
	return strings.Join(actions, "\n")
}

func buildTimelineMarkdown(timeline []model.TimelineEntry) string {
	if len(timeline) == 0 {
		return "- No timeline entries were captured."
	}
	lines := make([]string, 0, len(timeline))
	for _, entry := range timeline {
		source := strings.TrimSpace(entry.Source)
		if source == "" {
			source = "system"
		}
		lines = append(lines, fmt.Sprintf("- [%s] (%s) %s", entry.Timestamp, source, entry.Summary))
	}
	return strings.Join(lines, "\n")
}

func buildRunbookMarkdown(runbook []model.RunbookStep) string {
	if len(runbook) == 0 {
		return "- [ ] No runbook steps captured."
	}
	lines := make([]string, 0, len(runbook))
	for _, step := range runbook {
		icon := "[ ]"
		switch step.Status {
		case model.RunbookStepStatusInProgress:
			icon = "[~]"
		case model.RunbookStepStatusDone:
			icon = "[x]"
		case model.RunbookStepStatusSkipped:
			icon = "[>]"
		}
		lines = append(lines, fmt.Sprintf("- %s %s", icon, step.Title))
	}
	return strings.Join(lines, "\n")
}

func formatDuration(openedAtRaw, resolvedAtRaw string) string {
	openedAt, errOpen := time.Parse(time.RFC3339, strings.TrimSpace(openedAtRaw))
	resolvedAt, errResolved := time.Parse(time.RFC3339, strings.TrimSpace(resolvedAtRaw))
	if errOpen != nil || errResolved != nil || resolvedAt.Before(openedAt) {
		return "0 minutes"
	}
	delta := resolvedAt.Sub(openedAt)
	hours := int(delta.Hours())
	minutes := int(delta.Minutes()) % 60
	if hours <= 0 {
		return fmt.Sprintf("%d minutes", int(delta.Minutes()))
	}
	return fmt.Sprintf("%d hours %d minutes", hours, minutes)
}

func cloneTimeline(in []model.TimelineEntry) []model.TimelineEntry {
	out := make([]model.TimelineEntry, len(in))
	copy(out, in)
	return out
}
