package httpapi

import (
	"io"
	"log/slog"
	"strings"
	"testing"

	"kubelens-backend/internal/model"
)

func TestBuildTeamRunbookContextIncludesRunbooksAndFixPatterns(t *testing.T) {
	store := &testAssistantMemoryStore{
		runbooks: []model.MemoryRunbook{
			{
				ID:          "rbk-1",
				Title:       "Payment gateway OOM recovery",
				Tags:        []string{"payments", "oom"},
				Description: "Handle recurring OOM restarts for payment-gateway.",
				Steps:       []string{"Inspect pod memory limits", "Roll deployment restart", "Verify error budget"},
			},
		},
		fixes: []model.MemoryFixPattern{
			{
				ID:          "fix-1",
				Title:       "Rollback fixed checkout outage",
				Description: "Rolled back checkout-api to previous revision to stabilize latency.",
				Resource:    "production/payment-gateway",
				Kind:        model.RemediationKindRollbackDeployment,
				RecordedAt:  "2026-03-10T12:00:00Z",
			},
		},
	}

	server := newServer(
		testClusterReader{},
		nil,
		slog.New(slog.NewJSONHandler(io.Discard, nil)),
		WithMemoryStore(store),
	)

	contextText := server.buildTeamRunbookContext(
		"payment gateway outage",
		[]string{"production/payment-gateway"},
	)
	if !strings.Contains(contextText, "## TEAM RUNBOOKS") {
		t.Fatalf("expected runbook section in context, got: %s", contextText)
	}
	if !strings.Contains(contextText, "Payment gateway OOM recovery") {
		t.Fatalf("expected runbook title in context, got: %s", contextText)
	}
	if !strings.Contains(contextText, "## TEAM FIX PATTERNS") {
		t.Fatalf("expected fix pattern section in context, got: %s", contextText)
	}
	if !strings.Contains(contextText, "Rollback fixed checkout outage") {
		t.Fatalf("expected fix pattern in context, got: %s", contextText)
	}
	if store.incrementCount["rbk-1"] == 0 {
		t.Fatalf("expected runbook usage increment for rbk-1")
	}
}

type testAssistantMemoryStore struct {
	runbooks       []model.MemoryRunbook
	fixes          []model.MemoryFixPattern
	incrementCount map[string]int
}

func (m *testAssistantMemoryStore) Search(query string) []model.MemoryRunbook {
	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		return append([]model.MemoryRunbook(nil), m.runbooks...)
	}
	out := make([]model.MemoryRunbook, 0, len(m.runbooks))
	for _, runbook := range m.runbooks {
		if strings.Contains(strings.ToLower(runbook.Title), q) || strings.Contains(strings.ToLower(runbook.Description), q) {
			out = append(out, runbook)
		}
	}
	return out
}

func (m *testAssistantMemoryStore) IncrementUsage(id string) bool {
	if m.incrementCount == nil {
		m.incrementCount = map[string]int{}
	}
	m.incrementCount[id]++
	return true
}

func (m *testAssistantMemoryStore) CreateRunbook(req model.MemoryRunbookUpsertRequest) (model.MemoryRunbook, error) {
	return model.MemoryRunbook{}, nil
}

func (m *testAssistantMemoryStore) UpdateRunbook(id string, req model.MemoryRunbookUpsertRequest) (model.MemoryRunbook, error) {
	return model.MemoryRunbook{}, nil
}

func (m *testAssistantMemoryStore) ListFixes() []model.MemoryFixPattern {
	return append([]model.MemoryFixPattern(nil), m.fixes...)
}

func (m *testAssistantMemoryStore) RecordFix(req model.MemoryFixCreateRequest, recordedBy string) (model.MemoryFixPattern, error) {
	return model.MemoryFixPattern{}, nil
}

var _ memoryStore = (*testAssistantMemoryStore)(nil)
