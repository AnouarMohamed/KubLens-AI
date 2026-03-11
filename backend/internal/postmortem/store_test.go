package postmortem

import (
	"strings"
	"testing"
	"time"

	"kubelens-backend/internal/model"
)

func TestStoreCreateAndConflict(t *testing.T) {
	store := NewStore(50, func() time.Time {
		return time.Date(2026, time.March, 10, 12, 0, 0, 0, time.UTC)
	})

	first, err := store.Create(model.Postmortem{
		IncidentID:    "inc-1",
		IncidentTitle: "incident one",
		Method:        model.PostmortemMethodTemplate,
	})
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if strings.TrimSpace(first.ID) == "" {
		t.Fatal("postmortem ID should be assigned")
	}

	_, err = store.Create(model.Postmortem{
		IncidentID:    "inc-1",
		IncidentTitle: "incident one duplicate",
		Method:        model.PostmortemMethodTemplate,
	})
	if err == nil {
		t.Fatal("expected duplicate incident conflict")
	}
	if !strings.Contains(err.Error(), "postmortem already exists") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestStoreEvictsOldest(t *testing.T) {
	store := NewStore(2, time.Now)
	first, _ := store.Create(model.Postmortem{IncidentID: "inc-1", IncidentTitle: "one"})
	second, _ := store.Create(model.Postmortem{IncidentID: "inc-2", IncidentTitle: "two"})
	third, _ := store.Create(model.Postmortem{IncidentID: "inc-3", IncidentTitle: "three"})

	if _, ok := store.Get(first.ID); ok {
		t.Fatalf("expected first postmortem %s to be evicted", first.ID)
	}
	if _, ok := store.Get(second.ID); !ok {
		t.Fatalf("expected second postmortem %s", second.ID)
	}
	if _, ok := store.Get(third.ID); !ok {
		t.Fatalf("expected third postmortem %s", third.ID)
	}
}
