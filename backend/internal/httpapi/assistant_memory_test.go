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

func TestBuildDocsQueriesPrioritizesMessageAndDiagnosticsKeywords(t *testing.T) {
	queries := buildDocsQueries(
		"payment-gateway crashloopbackoff after deploy",
		"critical issue: payment-gateway pods show OOMKilled and liveness probe failures",
	)
	if len(queries) == 0 {
		t.Fatal("expected non-empty query plan")
	}
	if !strings.Contains(strings.ToLower(queries[0]), "payment-gateway") {
		t.Fatalf("expected first query to preserve message context, got %q", queries[0])
	}
	joined := strings.ToLower(strings.Join(queries, " "))
	for _, term := range []string{"crashloopbackoff", "oomkilled", "liveness"} {
		if !strings.Contains(joined, term) {
			t.Fatalf("expected combined queries to include %q, got %q", term, joined)
		}
	}
}

func TestExtractDocKeywordsFiltersNoiseAndDedupes(t *testing.T) {
	keywords := extractDocKeywords(
		"Please show kubernetes cluster issue issue for Payment-Gateway OOMKilled memory memory",
		8,
	)
	joined := strings.ToLower(strings.Join(keywords, " "))
	if strings.Contains(joined, "kubernetes") || strings.Contains(joined, "cluster") {
		t.Fatalf("expected noisy generic terms filtered out, got %q", joined)
	}
	if !strings.Contains(joined, "payment-gateway") || !strings.Contains(joined, "oomkilled") {
		t.Fatalf("expected specific terms retained, got %q", joined)
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
