package chatops

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"kubelens-backend/internal/model"
)

func TestNotifyIncidentSendsBlockKitAndRateLimits(t *testing.T) {
	var calls atomic.Int32
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		defer r.Body.Close()
		_ = json.NewDecoder(r.Body).Decode(&payload)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	notifier := NewSlackNotifier(Config{
		SlackWebhookURL:    server.URL,
		BaseURL:            "http://localhost:5173",
		NotifyIncidents:    true,
		NotifyRemediations: true,
		NotifyPostmortems:  true,
	}, nil, nil)
	now := time.Date(2026, time.March, 10, 12, 0, 0, 0, time.UTC)
	notifier.now = func() time.Time { return now }

	incident := model.Incident{
		ID:                "inc-1",
		Title:             "payment-gateway OOMKilled",
		Severity:          "critical",
		OpenedAt:          "2026-03-10T11:58:00Z",
		AffectedResources: []string{"production/payment-gateway"},
		Runbook: []model.RunbookStep{
			{ID: "step-1", Status: model.RunbookStepStatusPending},
		},
	}

	notifier.NotifyIncident(context.Background(), incident)
	notifier.NotifyIncident(context.Background(), incident)

	if calls.Load() != 1 {
		t.Fatalf("webhook calls = %d, want 1 due to rate limit", calls.Load())
	}

	blocks, ok := payload["blocks"].([]any)
	if !ok || len(blocks) == 0 {
		t.Fatalf("expected block payload, got %#v", payload)
	}
}

func TestNotifyRemediationAndPostmortem(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	notifier := NewSlackNotifier(Config{
		SlackWebhookURL:      server.URL,
		BaseURL:              "http://localhost:5173",
		NotifyIncidents:      false,
		NotifyRemediations:   true,
		NotifyPostmortems:    true,
		NotifyAssistantFinds: true,
	}, nil, nil)
	notifier.now = func() time.Time {
		return time.Date(2026, time.March, 10, 12, 0, 0, 0, time.UTC)
	}

	notifier.NotifyRemediation(context.Background(), model.RemediationProposal{
		ID:        "rem-1",
		Kind:      model.RemediationKindRestartPod,
		Namespace: "production",
		Resource:  "payment-gateway",
		Status:    "proposed",
		RiskLevel: "low",
		Reason:    "CrashLoop",
	})
	notifier.NotifyPostmortem(context.Background(), model.Postmortem{
		ID:            "pm-1",
		IncidentTitle: "payment gateway incident",
		Severity:      "warning",
		Duration:      "12 minutes",
		GeneratedAt:   "2026-03-10T12:00:00Z",
		Method:        model.PostmortemMethodTemplate,
	})
	notifier.NotifyAssistantFinding(context.Background(), "Detected repeated OOMs", []string{"production/payment-gateway"})

	if calls.Load() != 3 {
		t.Fatalf("webhook calls = %d, want 3", calls.Load())
	}
}
