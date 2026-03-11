package incident

import (
	"context"
	"sort"
	"strings"
	"time"

	"kubelens-backend/internal/model"
)

const (
	maxTimelineEntries = 50
)

type timelineRecord struct {
	at    time.Time
	entry model.TimelineEntry
}

func BuildIncident(
	_ context.Context,
	diag model.DiagnosticsResult,
	events []model.K8sEvent,
	pods []model.PodSummary,
	predictions model.PredictionsResult,
	now func() time.Time,
) model.Incident {
	clock := now
	if clock == nil {
		clock = time.Now
	}
	nowAt := clock().UTC()
	openedAt := nowAt.Format(time.RFC3339)

	severity := string(model.SeverityWarning)
	if diag.CriticalIssues > 0 {
		severity = string(model.SeverityCritical)
	}

	title := deriveIncidentTitle(diag, severity)
	timeline := buildTimeline(diag, events, predictions, nowAt)
	runbook := BuildRunbook(diag, pods, predictions.Items)
	affected := collectAffectedResources(diag, predictions)

	summary := strings.TrimSpace(diag.Summary)
	if summary == "" {
		summary = "Incident assembled from current cluster diagnostics, warning events, and predictive signals."
	}

	return model.Incident{
		ID:                       "",
		Title:                    title,
		Severity:                 severity,
		Status:                   model.IncidentStatusOpen,
		Summary:                  summary,
		OpenedAt:                 openedAt,
		ResolvedAt:               "",
		Timeline:                 timeline,
		Runbook:                  runbook,
		AffectedResources:        affected,
		AssociatedRemediationIDs: []string{},
	}
}

func deriveIncidentTitle(diag model.DiagnosticsResult, severity string) string {
	if severity == string(model.SeverityCritical) {
		for _, issue := range diag.Issues {
			if issue.Severity == model.SeverityCritical && strings.TrimSpace(issue.Message) != "" {
				return issue.Message
			}
		}
	}

	for _, issue := range diag.Issues {
		if issue.Severity == model.SeverityWarning && strings.TrimSpace(issue.Message) != "" {
			return issue.Message
		}
	}

	if strings.TrimSpace(diag.Summary) != "" {
		return "Cluster incident: diagnostics summary"
	}
	return "Cluster incident detected"
}

func buildTimeline(
	diag model.DiagnosticsResult,
	events []model.K8sEvent,
	predictions model.PredictionsResult,
	now time.Time,
) []model.TimelineEntry {
	records := make([]timelineRecord, 0, len(diag.Issues)+len(events)+len(predictions.Items))

	diagAt := parseRFC3339OrNow(diag.Timestamp, now)
	for _, issue := range diag.Issues {
		message := strings.TrimSpace(issue.Message)
		if message == "" {
			continue
		}
		records = append(records, timelineRecord{
			at: diagAt,
			entry: model.TimelineEntry{
				Timestamp: diagAt.UTC().Format(time.RFC3339),
				Kind:      model.TimelineEntryKindDiagnostic,
				Source:    defaultString(strings.TrimSpace(issue.Source), "diagnostics-engine"),
				Summary:   message,
				Resource:  strings.TrimSpace(issue.Resource),
				Severity:  string(issue.Severity),
			},
		})
	}

	for _, event := range events {
		if !strings.EqualFold(strings.TrimSpace(event.Type), "warning") {
			continue
		}
		eventAt := parseRFC3339OrNow(event.LastTimestamp, now)
		summary := strings.TrimSpace(event.Reason)
		if strings.TrimSpace(event.Message) != "" {
			if summary == "" {
				summary = strings.TrimSpace(event.Message)
			} else {
				summary = summary + ": " + strings.TrimSpace(event.Message)
			}
		}
		if summary == "" {
			summary = "Warning event reported"
		}
		records = append(records, timelineRecord{
			at: eventAt,
			entry: model.TimelineEntry{
				Timestamp: eventAt.UTC().Format(time.RFC3339),
				Kind:      model.TimelineEntryKindEvent,
				Source:    defaultString(strings.TrimSpace(event.From), "kubernetes-event"),
				Summary:   summary,
				Resource:  "",
				Severity:  string(model.SeverityWarning),
			},
		})
	}

	predAt := parseRFC3339OrNow(predictions.GeneratedAt, now)
	for _, item := range predictions.Items {
		if item.RiskScore < 50 {
			continue
		}
		resource := formatPredictionResource(item)
		sev := string(model.SeverityWarning)
		if item.RiskScore >= 80 {
			sev = string(model.SeverityCritical)
		}
		records = append(records, timelineRecord{
			at: predAt,
			entry: model.TimelineEntry{
				Timestamp: predAt.UTC().Format(time.RFC3339),
				Kind:      model.TimelineEntryKindPrediction,
				Source:    defaultString(strings.TrimSpace(predictions.Source), "predictor"),
				Summary:   defaultString(strings.TrimSpace(item.Summary), "Predictive risk signal"),
				Resource:  resource,
				Severity:  sev,
			},
		})
	}

	sort.SliceStable(records, func(i, j int) bool {
		return records[i].at.Before(records[j].at)
	})

	if len(records) > maxTimelineEntries {
		records = records[:maxTimelineEntries]
	}

	out := make([]model.TimelineEntry, 0, len(records))
	for _, record := range records {
		out = append(out, record.entry)
	}
	return out
}

func collectAffectedResources(diag model.DiagnosticsResult, predictions model.PredictionsResult) []string {
	out := make([]string, 0, len(diag.Issues)+len(predictions.Items))
	seen := map[string]struct{}{}
	add := func(resource string) {
		normalized := strings.TrimSpace(resource)
		if normalized == "" {
			return
		}
		if _, ok := seen[normalized]; ok {
			return
		}
		seen[normalized] = struct{}{}
		out = append(out, normalized)
	}

	for _, issue := range diag.Issues {
		add(issue.Resource)
	}
	for _, item := range predictions.Items {
		if item.RiskScore < 60 {
			continue
		}
		add(formatPredictionResource(item))
	}

	sort.Strings(out)
	return out
}

func formatPredictionResource(item model.IncidentPrediction) string {
	if strings.TrimSpace(item.Namespace) == "" {
		return strings.TrimSpace(item.Resource)
	}
	return strings.TrimSpace(item.Namespace) + "/" + strings.TrimSpace(item.Resource)
}

func parseRFC3339OrNow(raw string, fallback time.Time) time.Time {
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(raw))
	if err != nil {
		return fallback
	}
	return parsed.UTC()
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
