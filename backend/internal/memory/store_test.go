package memory

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"kubelens-backend/internal/model"
)

func TestStoreCreateSearchAndIncrementUsage(t *testing.T) {
	path := filepath.Join(t.TempDir(), "memory.json")
	store := New(path, nil)
	store.now = func() time.Time { return time.Date(2026, time.March, 10, 12, 0, 0, 0, time.UTC) }

	first, err := store.CreateRunbook(model.MemoryRunbookUpsertRequest{
		Title:       "Payment gateway OOM",
		Tags:        []string{"oom", "payments"},
		Description: "Recover payment-gateway from OOMKilled",
		Steps:       []string{"Check limits", "Restart deployment"},
	})
	if err != nil {
		t.Fatalf("CreateRunbook() error = %v", err)
	}
	_, _ = store.CreateRunbook(model.MemoryRunbookUpsertRequest{
		Title:       "Node pressure mitigation",
		Tags:        []string{"node", "pressure"},
		Description: "Cordon and drain noisy node",
		Steps:       []string{"Cordon node", "Drain node"},
	})

	if ok := store.IncrementUsage(first.ID); !ok {
		t.Fatal("IncrementUsage should succeed")
	}

	results := store.Search("oom")
	if len(results) != 1 {
		t.Fatalf("search result length = %d, want 1", len(results))
	}
	if results[0].ID != first.ID {
		t.Fatalf("search returned wrong runbook: %#v", results[0])
	}

	top := store.Search("")
	if len(top) == 0 {
		t.Fatal("empty search should return top runbooks")
	}
	if top[0].ID != first.ID {
		t.Fatalf("highest usage runbook should be first, got %s", top[0].ID)
	}
}

func TestStoreLoadsCorruptFileAsEmpty(t *testing.T) {
	path := filepath.Join(t.TempDir(), "memory.json")
	if err := os.WriteFile(path, []byte(`{"broken-json"`), 0o600); err != nil {
		t.Fatalf("write corrupt file: %v", err)
	}

	store := New(path, nil)
	if len(store.Search("")) != 0 {
		t.Fatal("corrupt file should load as empty store")
	}
}

func TestStorePersistsRunbooksAndFixes(t *testing.T) {
	path := filepath.Join(t.TempDir(), "memory.json")
	store := New(path, nil)
	store.now = func() time.Time { return time.Date(2026, time.March, 10, 12, 0, 0, 0, time.UTC) }

	runbook, err := store.CreateRunbook(model.MemoryRunbookUpsertRequest{
		Title:       "Crash loop recovery",
		Tags:        []string{"crashloop"},
		Description: "Recover crash loops",
		Steps:       []string{"Check logs"},
	})
	if err != nil {
		t.Fatalf("CreateRunbook() error = %v", err)
	}

	_, err = store.RecordFix(model.MemoryFixCreateRequest{
		IncidentID:  "inc-1",
		ProposalID:  "rem-1",
		Title:       "Restarted payment gateway",
		Description: "Resolved crash by restarting pod",
		Resource:    "production/payment-gateway",
		Kind:        model.RemediationKindRestartPod,
	}, "operator")
	if err != nil {
		t.Fatalf("RecordFix() error = %v", err)
	}

	reloaded := New(path, nil)
	found := reloaded.Search("crash")
	if len(found) == 0 || found[0].ID != runbook.ID {
		t.Fatalf("expected persisted runbook %s, got %#v", runbook.ID, found)
	}

	fixes := reloaded.ListFixes()
	if len(fixes) != 1 {
		t.Fatalf("persisted fixes length = %d, want 1", len(fixes))
	}
	if fixes[0].ProposalID != "rem-1" {
		t.Fatalf("unexpected fix payload: %+v", fixes[0])
	}
}

func TestSearchRanksByRelevanceBeforeUsage(t *testing.T) {
	path := filepath.Join(t.TempDir(), "memory.json")
	store := New(path, nil)
	store.now = func() time.Time { return time.Date(2026, time.March, 10, 12, 0, 0, 0, time.UTC) }

	lessRelevant, err := store.CreateRunbook(model.MemoryRunbookUpsertRequest{
		Title:       "Generic node checklist",
		Tags:        []string{"node"},
		Description: "Recover generic node issues.",
		Steps:       []string{"Inspect metrics"},
	})
	if err != nil {
		t.Fatalf("CreateRunbook(lessRelevant) error = %v", err)
	}
	_ = store.IncrementUsage(lessRelevant.ID)
	_ = store.IncrementUsage(lessRelevant.ID)

	moreRelevant, err := store.CreateRunbook(model.MemoryRunbookUpsertRequest{
		Title:       "Payment gateway OOM recovery",
		Tags:        []string{"payments", "oom"},
		Description: "Recover payment-gateway from OOMKilled.",
		Steps:       []string{"Check memory requests", "Restart deployment"},
	})
	if err != nil {
		t.Fatalf("CreateRunbook(moreRelevant) error = %v", err)
	}

	results := store.Search("recover")
	if len(results) < 2 {
		t.Fatalf("search results length = %d, want at least 2", len(results))
	}
	if results[0].ID != moreRelevant.ID {
		t.Fatalf("expected most relevant runbook first, got %s", results[0].ID)
	}
}
