package postmortem

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"kubelens-backend/internal/model"
)

const DefaultStoreLimit = 50

var (
	ErrPostmortemNotFound = errors.New("postmortem not found")
	ErrPostmortemExists   = errors.New("postmortem already exists for incident")
)

type Store struct {
	maxItems int
	now      func() time.Time

	mu      sync.RWMutex
	counter uint64
	items   []model.Postmortem
}

func NewStore(maxItems int, now func() time.Time) *Store {
	if maxItems <= 0 {
		maxItems = DefaultStoreLimit
	}
	clock := now
	if clock == nil {
		clock = time.Now
	}
	return &Store{
		maxItems: maxItems,
		now:      clock,
		items:    make([]model.Postmortem, 0, maxItems),
	}
}

func (s *Store) Create(postmortem model.Postmortem) (model.Postmortem, error) {
	if s == nil {
		return model.Postmortem{}, ErrPostmortemNotFound
	}
	incidentID := strings.TrimSpace(postmortem.IncidentID)
	if incidentID == "" {
		return model.Postmortem{}, ErrPostmortemNotFound
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for _, item := range s.items {
		if item.IncidentID == incidentID {
			return clonePostmortem(item), fmt.Errorf("%w: %s", ErrPostmortemExists, item.ID)
		}
	}

	s.counter++
	if strings.TrimSpace(postmortem.ID) == "" {
		postmortem.ID = fmt.Sprintf("pm-%d", s.counter)
	}
	if strings.TrimSpace(postmortem.GeneratedAt) == "" {
		postmortem.GeneratedAt = s.now().UTC().Format(time.RFC3339)
	}
	s.items = append(s.items, clonePostmortem(postmortem))
	if overflow := len(s.items) - s.maxItems; overflow > 0 {
		s.items = append([]model.Postmortem(nil), s.items[overflow:]...)
	}
	return clonePostmortem(postmortem), nil
}

func (s *Store) List() []model.Postmortem {
	if s == nil {
		return nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]model.Postmortem, 0, len(s.items))
	for i := len(s.items) - 1; i >= 0; i-- {
		out = append(out, clonePostmortem(s.items[i]))
	}
	return out
}

func (s *Store) Get(id string) (model.Postmortem, bool) {
	if s == nil {
		return model.Postmortem{}, false
	}
	needle := strings.TrimSpace(id)
	if needle == "" {
		return model.Postmortem{}, false
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.items {
		if s.items[i].ID == needle {
			return clonePostmortem(s.items[i]), true
		}
	}
	return model.Postmortem{}, false
}

func (s *Store) GetByIncidentID(incidentID string) (model.Postmortem, bool) {
	if s == nil {
		return model.Postmortem{}, false
	}
	needle := strings.TrimSpace(incidentID)
	if needle == "" {
		return model.Postmortem{}, false
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.items {
		if s.items[i].IncidentID == needle {
			return clonePostmortem(s.items[i]), true
		}
	}
	return model.Postmortem{}, false
}

func clonePostmortem(in model.Postmortem) model.Postmortem {
	out := in
	out.Timeline = append([]model.TimelineEntry(nil), in.Timeline...)
	out.Runbook = append([]model.RunbookStep(nil), in.Runbook...)
	return out
}
