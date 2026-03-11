package postmortem

import (
	"context"
	"testing"
	"time"

	"kubelens-backend/internal/ai"
	"kubelens-backend/internal/model"
)

type testEnricher struct {
	response string
	err      error
}

func (t testEnricher) Generate(context.Context, ai.Input) (string, error) {
	if t.err != nil {
		return "", t.err
	}
	return t.response, nil
}

func TestGenerateTemplatePostmortem(t *testing.T) {
	incident := model.Incident{
		ID:                "inc-1",
		Title:             "Payment crash loop",
		Severity:          "critical",
		OpenedAt:          "2026-03-10T10:00:00Z",
		ResolvedAt:        "2026-03-10T10:30:00Z",
		AffectedResources: []string{"production/payment-gateway"},
		Runbook: []model.RunbookStep{
			{ID: "step-1", Title: "Inspect pod", Status: model.RunbookStepStatusDone},
		},
		Timeline: []model.TimelineEntry{
			{Timestamp: "2026-03-10T10:01:00Z", Kind: model.TimelineEntryKindDiagnostic, Summary: "OOMKilled detected", Severity: "critical"},
		},
	}

	postmortem := Generate(context.Background(), incident, nil, func() time.Time {
		return time.Date(2026, time.March, 10, 11, 0, 0, 0, time.UTC)
	})

	if postmortem.Method != model.PostmortemMethodTemplate {
		t.Fatalf("method = %s, want template", postmortem.Method)
	}
	if postmortem.Duration != "30 minutes" {
		t.Fatalf("duration = %q, want 30 minutes", postmortem.Duration)
	}
	if postmortem.RootCause == "" || postmortem.Prevention == "" || postmortem.Impact == "" {
		t.Fatalf("postmortem should have complete sections: %+v", postmortem)
	}
}

func TestGenerateWithAIEnrichment(t *testing.T) {
	incident := model.Incident{
		ID:         "inc-2",
		Title:      "Node not ready",
		Severity:   "critical",
		OpenedAt:   "2026-03-10T10:00:00Z",
		ResolvedAt: "2026-03-10T11:00:00Z",
		Timeline: []model.TimelineEntry{
			{Timestamp: "2026-03-10T10:01:00Z", Kind: model.TimelineEntryKindDiagnostic, Summary: "Node not ready", Severity: "critical"},
		},
	}

	pm := Generate(context.Background(), incident, testEnricher{
		response: `{"root_cause":"Control-plane connectivity degraded the node heartbeat path.","prevention_items":["Owner: SRE (2 weeks) - add node heartbeat SLO.","Owner: Platform (1 week) - alert on NotReady transitions."]}`,
	}, time.Now)

	if pm.Method != model.PostmortemMethodAI {
		t.Fatalf("method = %s, want ai", pm.Method)
	}
	if pm.RootCause != "Control-plane connectivity degraded the node heartbeat path." {
		t.Fatalf("unexpected root cause: %s", pm.RootCause)
	}
	if pm.Prevention == "" || pm.Prevention[0] != '-' {
		t.Fatalf("unexpected prevention: %s", pm.Prevention)
	}
}
