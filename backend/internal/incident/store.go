package incident

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"kubelens-backend/internal/model"
)

const (
	DefaultStoreLimit = 50
)

var (
	ErrIncidentNotFound = errors.New("incident not found")
	ErrStepNotFound     = errors.New("runbook step not found")
)

type Store struct {
	maxItems int
	now      func() time.Time

	mu      sync.RWMutex
	counter uint64
	items   []model.Incident
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
		items:    make([]model.Incident, 0, maxItems),
	}
}

func (s *Store) Create(incident model.Incident) model.Incident {
	if s == nil {
		return incident
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.counter++
	if strings.TrimSpace(incident.ID) == "" {
		incident.ID = fmt.Sprintf("inc-%d", s.counter)
	}
	incident.Status = model.IncidentStatusOpen
	if strings.TrimSpace(incident.OpenedAt) == "" {
		incident.OpenedAt = s.now().UTC().Format(time.RFC3339)
	}
	incident.ResolvedAt = ""
	if incident.AssociatedRemediationIDs == nil {
		incident.AssociatedRemediationIDs = []string{}
	}

	s.items = append(s.items, cloneIncident(incident))
	if overflow := len(s.items) - s.maxItems; overflow > 0 {
		s.items = append([]model.Incident(nil), s.items[overflow:]...)
	}

	return cloneIncident(incident)
}

func (s *Store) List() []model.Incident {
	if s == nil {
		return nil
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]model.Incident, 0, len(s.items))
	for i := len(s.items) - 1; i >= 0; i-- {
		out = append(out, cloneIncident(s.items[i]))
	}
	return out
}

func (s *Store) Get(id string) (model.Incident, bool) {
	if s == nil {
		return model.Incident{}, false
	}

	needle := strings.TrimSpace(id)
	if needle == "" {
		return model.Incident{}, false
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	for i := range s.items {
		if s.items[i].ID == needle {
			return cloneIncident(s.items[i]), true
		}
	}
	return model.Incident{}, false
}

func (s *Store) PatchStepStatus(id string, stepID string, target model.RunbookStepStatus) (model.Incident, error) {
	if s == nil {
		return model.Incident{}, ErrIncidentNotFound
	}

	incidentID := strings.TrimSpace(id)
	runbookStepID := strings.TrimSpace(stepID)
	if incidentID == "" || runbookStepID == "" {
		return model.Incident{}, ErrIncidentNotFound
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	idx := s.findIncidentLocked(incidentID)
	if idx < 0 {
		return model.Incident{}, ErrIncidentNotFound
	}

	incident := &s.items[idx]
	for i := range incident.Runbook {
		step := &incident.Runbook[i]
		if step.ID != runbookStepID {
			continue
		}

		if step.Mandatory && target == model.RunbookStepStatusSkipped {
			return model.Incident{}, errors.New("final verification step cannot be skipped")
		}

		if err := validateStatusTransition(step.Status, target); err != nil {
			return model.Incident{}, err
		}

		step.Status = target
		nowAt := s.now().UTC().Format(time.RFC3339)
		incident.Timeline = append(incident.Timeline, model.TimelineEntry{
			Timestamp: nowAt,
			Kind:      model.TimelineEntryKindAction,
			Source:    "incident-commander",
			Summary:   fmt.Sprintf("Runbook step %s moved to %s", step.ID, step.Status),
			Resource:  "",
			Severity:  "info",
		})
		sort.SliceStable(incident.Timeline, func(i, j int) bool {
			return incident.Timeline[i].Timestamp < incident.Timeline[j].Timestamp
		})
		return cloneIncident(*incident), nil
	}

	return model.Incident{}, ErrStepNotFound
}

func (s *Store) Resolve(id string) (model.Incident, error) {
	if s == nil {
		return model.Incident{}, ErrIncidentNotFound
	}

	incidentID := strings.TrimSpace(id)
	if incidentID == "" {
		return model.Incident{}, ErrIncidentNotFound
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	idx := s.findIncidentLocked(incidentID)
	if idx < 0 {
		return model.Incident{}, ErrIncidentNotFound
	}

	incident := &s.items[idx]
	if incident.Status == model.IncidentStatusResolved {
		return cloneIncident(*incident), nil
	}
	if !canResolveIncident(*incident) {
		return model.Incident{}, errors.New("incident cannot be resolved: all runbook steps must be done or skipped")
	}

	nowAt := s.now().UTC().Format(time.RFC3339)
	incident.Status = model.IncidentStatusResolved
	incident.ResolvedAt = nowAt
	incident.Timeline = append(incident.Timeline, model.TimelineEntry{
		Timestamp: nowAt,
		Kind:      model.TimelineEntryKindAction,
		Source:    "incident-commander",
		Summary:   "Incident resolved",
		Resource:  "",
		Severity:  "info",
	})
	sort.SliceStable(incident.Timeline, func(i, j int) bool {
		return incident.Timeline[i].Timestamp < incident.Timeline[j].Timestamp
	})

	return cloneIncident(*incident), nil
}

func canResolveIncident(incident model.Incident) bool {
	for _, step := range incident.Runbook {
		if step.Mandatory {
			if step.Status != model.RunbookStepStatusDone {
				return false
			}
			continue
		}
		if step.Status != model.RunbookStepStatusDone && step.Status != model.RunbookStepStatusSkipped {
			return false
		}
	}
	return true
}

func (s *Store) AssociateRemediation(incidentID string, proposalID string) error {
	if s == nil {
		return ErrIncidentNotFound
	}

	incID := strings.TrimSpace(incidentID)
	propID := strings.TrimSpace(proposalID)
	if incID == "" || propID == "" {
		return ErrIncidentNotFound
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	idx := s.findIncidentLocked(incID)
	if idx < 0 {
		return ErrIncidentNotFound
	}

	current := s.items[idx].AssociatedRemediationIDs
	for _, id := range current {
		if id == propID {
			return nil
		}
	}
	s.items[idx].AssociatedRemediationIDs = append(current, propID)
	sort.Strings(s.items[idx].AssociatedRemediationIDs)
	return nil
}

func (s *Store) findIncidentLocked(id string) int {
	for i := range s.items {
		if s.items[i].ID == id {
			return i
		}
	}
	return -1
}

func validateStatusTransition(from model.RunbookStepStatus, to model.RunbookStepStatus) error {
	valid := false
	switch from {
	case model.RunbookStepStatusPending:
		valid = to == model.RunbookStepStatusInProgress || to == model.RunbookStepStatusSkipped
	case model.RunbookStepStatusInProgress:
		valid = to == model.RunbookStepStatusDone || to == model.RunbookStepStatusSkipped
	default:
		valid = false
	}

	if valid {
		return nil
	}
	return fmt.Errorf("invalid status transition: %s → %s", from, to)
}

func cloneIncident(in model.Incident) model.Incident {
	out := in
	out.Timeline = append([]model.TimelineEntry(nil), in.Timeline...)
	out.Runbook = append([]model.RunbookStep(nil), in.Runbook...)
	out.AffectedResources = append([]string(nil), in.AffectedResources...)
	out.AssociatedRemediationIDs = append([]string(nil), in.AssociatedRemediationIDs...)
	return out
}
