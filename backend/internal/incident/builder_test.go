package incident

import (
	"context"
	"testing"
	"time"

	"kubelens-backend/internal/model"
)

func TestBuildIncidentEmptyInputsStillValid(t *testing.T) {
	now := time.Date(2026, time.March, 10, 12, 0, 0, 0, time.UTC)
	incident := BuildIncident(context.Background(), model.DiagnosticsResult{}, nil, nil, model.PredictionsResult{}, func() time.Time {
		return now
	})

	if incident.Status != model.IncidentStatusOpen {
		t.Fatalf("status = %s, want %s", incident.Status, model.IncidentStatusOpen)
	}
	if incident.Severity != string(model.SeverityWarning) {
		t.Fatalf("severity = %s, want %s", incident.Severity, model.SeverityWarning)
	}
	if len(incident.Timeline) != 0 {
		t.Fatalf("timeline length = %d, want 0", len(incident.Timeline))
	}
	if len(incident.Runbook) == 0 {
		t.Fatal("runbook should include final verification step")
	}
	last := incident.Runbook[len(incident.Runbook)-1]
	if last.Title != "Verify cluster health" || !last.Mandatory {
		t.Fatalf("unexpected final step: %+v", last)
	}
}

func TestBuildIncidentTimelineAndAffectedResources(t *testing.T) {
	now := time.Date(2026, time.March, 10, 12, 0, 0, 0, time.UTC)
	diagTime := now.Add(-10 * time.Minute).Format(time.RFC3339)
	predTime := now.Add(-5 * time.Minute).Format(time.RFC3339)
	eventTime := now.Add(-2 * time.Minute).Format(time.RFC3339)

	diag := model.DiagnosticsResult{
		Timestamp:      diagTime,
		CriticalIssues: 1,
		Issues: []model.DiagnosticIssue{
			{
				Severity:       model.SeverityCritical,
				Resource:       "production/payment-gateway-7f8d-abc12",
				Message:        "Pod crash loop",
				Recommendation: "Inspect logs",
				Source:         "plugin-a",
			},
		},
	}

	events := []model.K8sEvent{
		{Type: "Normal", Reason: "Scheduled", Message: "ignored"},
		{Type: "Warning", Reason: "BackOff", Message: "restart failed", LastTimestamp: eventTime, From: "kubelet"},
	}

	predictions := model.PredictionsResult{
		Source:      "predictor",
		GeneratedAt: predTime,
		Items: []model.IncidentPrediction{
			{Resource: "payment-gateway-7f8d-abc12", Namespace: "production", RiskScore: 72, Summary: "high restart risk"},
		},
	}

	incident := BuildIncident(context.Background(), diag, events, nil, predictions, func() time.Time { return now })
	if incident.Severity != string(model.SeverityCritical) {
		t.Fatalf("severity = %s, want critical", incident.Severity)
	}
	if incident.Title != "Pod crash loop" {
		t.Fatalf("title = %q, want %q", incident.Title, "Pod crash loop")
	}
	if len(incident.Timeline) != 3 {
		t.Fatalf("timeline length = %d, want 3", len(incident.Timeline))
	}
	if incident.Timeline[0].Kind != model.TimelineEntryKindDiagnostic {
		t.Fatalf("first timeline kind = %s, want %s", incident.Timeline[0].Kind, model.TimelineEntryKindDiagnostic)
	}
	if incident.Timeline[2].Kind != model.TimelineEntryKindEvent {
		t.Fatalf("last timeline kind = %s, want %s", incident.Timeline[2].Kind, model.TimelineEntryKindEvent)
	}
	if len(incident.AffectedResources) != 1 || incident.AffectedResources[0] != "production/payment-gateway-7f8d-abc12" {
		t.Fatalf("affected resources = %#v", incident.AffectedResources)
	}
}
