package httpapi

import (
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"kubelens-backend/internal/model"
)

const defaultAlertLifecycleLimit = 2000

var errAlertLifecycleInvalid = errors.New("invalid alert lifecycle payload")

type alertLifecycleStore struct {
	now      func() time.Time
	maxItems int

	mu    sync.RWMutex
	items map[string]model.NodeAlertLifecycle
}

func newAlertLifecycleStore(maxItems int, now func() time.Time) *alertLifecycleStore {
	limit := maxItems
	if limit <= 0 {
		limit = defaultAlertLifecycleLimit
	}
	clock := now
	if clock == nil {
		clock = time.Now
	}
	return &alertLifecycleStore{
		now:      clock,
		maxItems: limit,
		items:    make(map[string]model.NodeAlertLifecycle, limit),
	}
}

func (s *alertLifecycleStore) List() []model.NodeAlertLifecycle {
	if s == nil {
		return nil
	}

	nowAt := s.now().UTC()
	s.mu.Lock()
	defer s.mu.Unlock()

	out := make([]model.NodeAlertLifecycle, 0, len(s.items))
	for key, item := range s.items {
		item = normalizeLifecycleExpiry(item, nowAt)
		s.items[key] = item
		out = append(out, item)
	}

	sort.SliceStable(out, func(i, j int) bool {
		return out[i].UpdatedAt > out[j].UpdatedAt
	})
	return out
}

func (s *alertLifecycleStore) Upsert(req model.NodeAlertLifecycleUpdateRequest, actor string) (model.NodeAlertLifecycle, error) {
	if s == nil {
		return model.NodeAlertLifecycle{}, errAlertLifecycleInvalid
	}

	id := strings.TrimSpace(req.ID)
	node := strings.TrimSpace(req.Node)
	rule := strings.TrimSpace(req.Rule)
	note := strings.TrimSpace(req.Note)
	status := normalizeLifecycleStatus(req.Status)

	if id == "" || node == "" || rule == "" || status == "" {
		return model.NodeAlertLifecycle{}, errAlertLifecycleInvalid
	}

	updatedBy := strings.TrimSpace(actor)
	if updatedBy == "" {
		updatedBy = "unknown"
	}

	nowAt := s.now().UTC()
	out := model.NodeAlertLifecycle{
		ID:        id,
		Node:      node,
		Rule:      rule,
		Status:    status,
		Note:      note,
		UpdatedAt: nowAt.Format(time.RFC3339),
		UpdatedBy: updatedBy,
	}

	if status == model.NodeAlertStatusSnoozed {
		if req.SnoozeMinutes <= 0 || req.SnoozeMinutes > 24*60 {
			return model.NodeAlertLifecycle{}, errAlertLifecycleInvalid
		}
		out.SnoozedUntil = nowAt.Add(time.Duration(req.SnoozeMinutes) * time.Minute).Format(time.RFC3339)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.items[id] = out
	s.trimLocked()
	return out, nil
}

func (s *alertLifecycleStore) trimLocked() {
	if len(s.items) <= s.maxItems {
		return
	}

	items := make([]model.NodeAlertLifecycle, 0, len(s.items))
	for _, item := range s.items {
		items = append(items, item)
	}
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].UpdatedAt > items[j].UpdatedAt
	})

	for i := s.maxItems; i < len(items); i++ {
		delete(s.items, items[i].ID)
	}
}

func normalizeLifecycleStatus(raw model.NodeAlertLifecycleStatus) model.NodeAlertLifecycleStatus {
	switch strings.ToLower(strings.TrimSpace(string(raw))) {
	case string(model.NodeAlertStatusActive):
		return model.NodeAlertStatusActive
	case string(model.NodeAlertStatusAcknowledged):
		return model.NodeAlertStatusAcknowledged
	case string(model.NodeAlertStatusSnoozed):
		return model.NodeAlertStatusSnoozed
	case string(model.NodeAlertStatusDismissed):
		return model.NodeAlertStatusDismissed
	default:
		return ""
	}
}

func normalizeLifecycleExpiry(item model.NodeAlertLifecycle, nowAt time.Time) model.NodeAlertLifecycle {
	if item.Status != model.NodeAlertStatusSnoozed || strings.TrimSpace(item.SnoozedUntil) == "" {
		return item
	}

	until, err := time.Parse(time.RFC3339, item.SnoozedUntil)
	if err != nil {
		item.Status = model.NodeAlertStatusActive
		item.SnoozedUntil = ""
		item.UpdatedAt = nowAt.Format(time.RFC3339)
		return item
	}
	if nowAt.After(until) || nowAt.Equal(until) {
		item.Status = model.NodeAlertStatusActive
		item.SnoozedUntil = ""
		item.UpdatedAt = nowAt.Format(time.RFC3339)
	}
	return item
}
