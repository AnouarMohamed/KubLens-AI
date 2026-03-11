package remediation

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"kubelens-backend/internal/model"
)

const (
	DefaultStoreLimit = 100
)

var (
	ErrProposalNotFound      = errors.New("remediation proposal not found")
	ErrProposalNotExecutable = errors.New("proposal must be approved before execution")
)

type Store struct {
	maxItems int
	now      func() time.Time

	mu      sync.RWMutex
	counter uint64
	items   []model.RemediationProposal
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
		items:    make([]model.RemediationProposal, 0, maxItems),
	}
}

func (s *Store) SaveProposals(proposals []model.RemediationProposal) []model.RemediationProposal {
	if s == nil || len(proposals) == 0 {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	nowAt := s.now().UTC().Format(time.RFC3339)
	out := make([]model.RemediationProposal, 0, len(proposals))
	for _, proposal := range proposals {
		normalized := normalizeProposal(proposal)

		existingIdx := s.findActiveDuplicateLocked(normalized)
		if existingIdx >= 0 {
			current := &s.items[existingIdx]
			if normalized.Reason != "" {
				current.Reason = normalized.Reason
			}
			if normalized.RiskLevel != "" {
				current.RiskLevel = normalized.RiskLevel
			}
			if normalized.DryRunResult != "" {
				current.DryRunResult = normalized.DryRunResult
			}
			if normalized.IncidentID != "" {
				current.IncidentID = normalized.IncidentID
			}
			current.UpdatedAt = nowAt
			out = append(out, cloneProposal(*current))
			continue
		}

		s.counter++
		normalized.ID = fmt.Sprintf("rem-%d", s.counter)
		normalized.CreatedAt = nowAt
		normalized.UpdatedAt = nowAt
		s.items = append(s.items, normalized)
		out = append(out, cloneProposal(normalized))
	}

	if overflow := len(s.items) - s.maxItems; overflow > 0 {
		s.items = append([]model.RemediationProposal(nil), s.items[overflow:]...)
	}
	return out
}

func (s *Store) findActiveDuplicateLocked(candidate model.RemediationProposal) int {
	for i := range s.items {
		item := s.items[i]
		if item.Kind != candidate.Kind {
			continue
		}
		if strings.ToLower(strings.TrimSpace(item.Namespace)) != strings.ToLower(strings.TrimSpace(candidate.Namespace)) {
			continue
		}
		if strings.ToLower(strings.TrimSpace(item.Resource)) != strings.ToLower(strings.TrimSpace(candidate.Resource)) {
			continue
		}
		if item.Status != "proposed" && item.Status != "approved" {
			continue
		}
		return i
	}
	return -1
}

func (s *Store) List() []model.RemediationProposal {
	if s == nil {
		return nil
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]model.RemediationProposal, 0, len(s.items))
	for i := len(s.items) - 1; i >= 0; i-- {
		out = append(out, cloneProposal(s.items[i]))
	}
	return out
}

func (s *Store) Get(id string) (model.RemediationProposal, bool) {
	if s == nil {
		return model.RemediationProposal{}, false
	}

	needle := strings.TrimSpace(id)
	if needle == "" {
		return model.RemediationProposal{}, false
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.items {
		if s.items[i].ID == needle {
			return cloneProposal(s.items[i]), true
		}
	}
	return model.RemediationProposal{}, false
}

func (s *Store) Approve(id string, user string) (model.RemediationProposal, error) {
	return s.updateWithUser(id, user, func(proposal *model.RemediationProposal, nowAt string, actor string) error {
		if proposal.Status == "executed" || proposal.Status == "rejected" {
			return fmt.Errorf("proposal already %s", proposal.Status)
		}
		proposal.Status = "approved"
		proposal.ApprovedBy = actor
		proposal.ApprovedAt = nowAt
		return nil
	})
}

func (s *Store) Reject(id string, user string, reason string) (model.RemediationProposal, error) {
	return s.updateWithUser(id, user, func(proposal *model.RemediationProposal, nowAt string, actor string) error {
		if proposal.Status == "executed" {
			return errors.New("executed proposals cannot be rejected")
		}
		proposal.Status = "rejected"
		proposal.RejectedBy = actor
		proposal.RejectedAt = nowAt
		proposal.RejectedReason = strings.TrimSpace(reason)
		return nil
	})
}

func (s *Store) MarkExecuted(id string, user string, result string) (model.RemediationProposal, error) {
	return s.updateWithUser(id, user, func(proposal *model.RemediationProposal, nowAt string, actor string) error {
		if proposal.Status != "approved" {
			return ErrProposalNotExecutable
		}
		proposal.Status = "executed"
		proposal.ExecutedBy = actor
		proposal.ExecutedAt = nowAt
		proposal.ExecutionResult = strings.TrimSpace(result)
		return nil
	})
}

func (s *Store) updateWithUser(
	id string,
	user string,
	mutate func(proposal *model.RemediationProposal, nowAt string, actor string) error,
) (model.RemediationProposal, error) {
	if s == nil {
		return model.RemediationProposal{}, ErrProposalNotFound
	}
	needle := strings.TrimSpace(id)
	if needle == "" {
		return model.RemediationProposal{}, ErrProposalNotFound
	}
	actor := strings.TrimSpace(user)
	if actor == "" {
		actor = "unknown"
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.items {
		if s.items[i].ID != needle {
			continue
		}
		nowAt := s.now().UTC().Format(time.RFC3339)
		if err := mutate(&s.items[i], nowAt, actor); err != nil {
			return model.RemediationProposal{}, err
		}
		s.items[i].UpdatedAt = nowAt
		return cloneProposal(s.items[i]), nil
	}

	return model.RemediationProposal{}, ErrProposalNotFound
}

func normalizeProposal(in model.RemediationProposal) model.RemediationProposal {
	out := in
	out.ID = ""
	out.Status = fallbackString(strings.TrimSpace(in.Status), "proposed")
	out.IncidentID = strings.TrimSpace(in.IncidentID)
	out.Namespace = strings.TrimSpace(in.Namespace)
	out.Resource = strings.TrimSpace(in.Resource)
	out.Reason = strings.TrimSpace(in.Reason)
	out.RiskLevel = strings.TrimSpace(in.RiskLevel)
	out.DryRunResult = strings.TrimSpace(in.DryRunResult)
	out.ExecutionResult = strings.TrimSpace(in.ExecutionResult)
	out.CreatedAt = ""
	out.UpdatedAt = ""
	out.ApprovedBy = ""
	out.ApprovedAt = ""
	out.RejectedBy = ""
	out.RejectedAt = ""
	out.RejectedReason = ""
	out.ExecutedBy = ""
	out.ExecutedAt = ""
	return out
}

func fallbackString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func cloneProposal(in model.RemediationProposal) model.RemediationProposal {
	out := in
	return out
}
