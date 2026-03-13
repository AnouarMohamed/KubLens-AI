package memory

import (
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"kubelens-backend/internal/model"
)

type Store struct {
	filePath string
	logger   *slog.Logger
	now      func() time.Time

	mu       sync.RWMutex
	counter  uint64
	runbooks []model.MemoryRunbook
	fixes    []model.MemoryFixPattern
}

func New(filePath string, logger *slog.Logger) *Store {
	path := strings.TrimSpace(filePath)
	if path == "" {
		path = filepath.Clean("data/memory-runbooks.json")
	}
	if logger == nil {
		logger = slog.Default()
	}

	store := &Store{
		filePath: path,
		logger:   logger,
		now:      time.Now,
		runbooks: make([]model.MemoryRunbook, 0, 128),
		fixes:    make([]model.MemoryFixPattern, 0, 256),
	}
	store.load()
	return store
}

func (s *Store) Search(query string) []model.MemoryRunbook {
	if s == nil {
		return nil
	}

	needle := strings.ToLower(strings.TrimSpace(query))
	terms := searchTerms(needle)
	s.mu.RLock()
	defer s.mu.RUnlock()

	type scoredRunbook struct {
		runbook model.MemoryRunbook
		score   int
	}
	candidates := make([]scoredRunbook, 0, len(s.runbooks))
	for _, runbook := range s.runbooks {
		score := 0
		if needle != "" {
			score = runbookMatchScore(runbook, needle, terms)
			if score == 0 {
				continue
			}
		}
		candidates = append(candidates, scoredRunbook{
			runbook: cloneRunbook(runbook),
			score:   score,
		})
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].score != candidates[j].score {
			return candidates[i].score > candidates[j].score
		}
		if candidates[i].runbook.UsageCount != candidates[j].runbook.UsageCount {
			return candidates[i].runbook.UsageCount > candidates[j].runbook.UsageCount
		}
		return candidates[i].runbook.UpdatedAt > candidates[j].runbook.UpdatedAt
	})

	if len(candidates) > 5 {
		candidates = candidates[:5]
	}

	out := make([]model.MemoryRunbook, 0, len(candidates))
	for _, candidate := range candidates {
		out = append(out, candidate.runbook)
	}
	return out
}

func (s *Store) IncrementUsage(id string) bool {
	if s == nil {
		return false
	}

	needle := strings.TrimSpace(id)
	if needle == "" {
		return false
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.runbooks {
		if s.runbooks[i].ID != needle {
			continue
		}
		s.runbooks[i].UsageCount++
		s.runbooks[i].UpdatedAt = s.now().UTC().Format(time.RFC3339)
		s.persistLocked()
		return true
	}
	return false
}

func (s *Store) CreateRunbook(req model.MemoryRunbookUpsertRequest) (model.MemoryRunbook, error) {
	if s == nil {
		return model.MemoryRunbook{}, os.ErrInvalid
	}

	runbook, err := normalizeRunbookRequest(req)
	if err != nil {
		return model.MemoryRunbook{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.counter++
	nowAt := s.now().UTC().Format(time.RFC3339)
	runbook.ID = "rbk-" + formatCounter(s.counter)
	runbook.CreatedAt = nowAt
	runbook.UpdatedAt = nowAt
	runbook.UsageCount = 0
	s.runbooks = append(s.runbooks, runbook)
	s.persistLocked()
	return cloneRunbook(runbook), nil
}

func (s *Store) UpdateRunbook(id string, req model.MemoryRunbookUpsertRequest) (model.MemoryRunbook, error) {
	if s == nil {
		return model.MemoryRunbook{}, os.ErrInvalid
	}

	needle := strings.TrimSpace(id)
	if needle == "" {
		return model.MemoryRunbook{}, os.ErrInvalid
	}
	normalized, err := normalizeRunbookRequest(req)
	if err != nil {
		return model.MemoryRunbook{}, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	for i := range s.runbooks {
		if s.runbooks[i].ID != needle {
			continue
		}
		s.runbooks[i].Title = normalized.Title
		s.runbooks[i].Tags = append([]string(nil), normalized.Tags...)
		s.runbooks[i].Description = normalized.Description
		s.runbooks[i].Steps = append([]string(nil), normalized.Steps...)
		s.runbooks[i].UpdatedAt = s.now().UTC().Format(time.RFC3339)
		s.persistLocked()
		return cloneRunbook(s.runbooks[i]), nil
	}

	return model.MemoryRunbook{}, os.ErrNotExist
}

func (s *Store) ListFixes() []model.MemoryFixPattern {
	if s == nil {
		return nil
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]model.MemoryFixPattern, 0, len(s.fixes))
	for i := range s.fixes {
		out = append(out, cloneFix(s.fixes[i]))
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].RecordedAt > out[j].RecordedAt
	})
	return out
}

func (s *Store) RecordFix(req model.MemoryFixCreateRequest, recordedBy string) (model.MemoryFixPattern, error) {
	if s == nil {
		return model.MemoryFixPattern{}, os.ErrInvalid
	}
	title := strings.TrimSpace(req.Title)
	description := strings.TrimSpace(req.Description)
	resource := strings.TrimSpace(req.Resource)
	if title == "" || description == "" || resource == "" {
		return model.MemoryFixPattern{}, os.ErrInvalid
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.counter++
	nowAt := s.now().UTC().Format(time.RFC3339)
	fix := model.MemoryFixPattern{
		ID:          "fix-" + formatCounter(s.counter),
		IncidentID:  strings.TrimSpace(req.IncidentID),
		ProposalID:  strings.TrimSpace(req.ProposalID),
		Title:       title,
		Description: description,
		Resource:    resource,
		Kind:        req.Kind,
		RecordedBy:  defaultString(strings.TrimSpace(recordedBy), "unknown"),
		RecordedAt:  nowAt,
	}
	s.fixes = append(s.fixes, fix)
	s.persistLocked()
	return cloneFix(fix), nil
}
