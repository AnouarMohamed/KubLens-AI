package memory

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"kubelens-backend/internal/model"
)

type diskState struct {
	Counter  uint64                   `json:"counter"`
	Runbooks []model.MemoryRunbook    `json:"runbooks"`
	Fixes    []model.MemoryFixPattern `json:"fixes"`
}

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

func (s *Store) load() {
	s.mu.Lock()
	defer s.mu.Unlock()

	payload, err := os.ReadFile(filepath.Clean(s.filePath))
	if err != nil {
		if !os.IsNotExist(err) && s.logger != nil {
			s.logger.Error("memory store read failed", "path", s.filePath, "error", err.Error())
		}
		return
	}

	var state diskState
	if err := json.Unmarshal(payload, &state); err != nil {
		if s.logger != nil {
			s.logger.Error("memory store is corrupt; starting empty", "path", s.filePath, "error", err.Error())
		}
		return
	}

	s.counter = state.Counter
	s.runbooks = make([]model.MemoryRunbook, 0, len(state.Runbooks))
	for _, runbook := range state.Runbooks {
		s.runbooks = append(s.runbooks, cloneRunbook(runbook))
	}
	s.fixes = make([]model.MemoryFixPattern, 0, len(state.Fixes))
	for _, fix := range state.Fixes {
		s.fixes = append(s.fixes, cloneFix(fix))
	}
}

func (s *Store) persistLocked() {
	state := diskState{
		Counter:  s.counter,
		Runbooks: make([]model.MemoryRunbook, 0, len(s.runbooks)),
		Fixes:    make([]model.MemoryFixPattern, 0, len(s.fixes)),
	}
	for _, runbook := range s.runbooks {
		state.Runbooks = append(state.Runbooks, cloneRunbook(runbook))
	}
	for _, fix := range s.fixes {
		state.Fixes = append(state.Fixes, cloneFix(fix))
	}

	payload, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		if s.logger != nil {
			s.logger.Error("memory store encode failed", "path", s.filePath, "error", err.Error())
		}
		return
	}

	path := filepath.Clean(s.filePath)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		if s.logger != nil {
			s.logger.Warn("memory store mkdir failed", "path", s.filePath, "error", err.Error())
		}
		return
	}

	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, payload, 0o600); err != nil {
		if s.logger != nil {
			s.logger.Warn("memory store temp write failed", "path", tmpPath, "error", err.Error())
		}
		return
	}
	if err := os.Rename(tmpPath, path); err != nil {
		if s.logger != nil {
			s.logger.Warn("memory store atomic rename failed", "path", s.filePath, "error", err.Error())
		}
		return
	}
}

func runbookMatches(runbook model.MemoryRunbook, needle string) bool {
	if strings.Contains(strings.ToLower(runbook.Title), needle) {
		return true
	}
	if strings.Contains(strings.ToLower(runbook.Description), needle) {
		return true
	}
	for _, tag := range runbook.Tags {
		if strings.Contains(strings.ToLower(tag), needle) {
			return true
		}
	}
	for _, step := range runbook.Steps {
		if strings.Contains(strings.ToLower(step), needle) {
			return true
		}
	}
	return false
}

func searchTerms(query string) []string {
	if strings.TrimSpace(query) == "" {
		return nil
	}
	fields := strings.FieldsFunc(query, func(r rune) bool {
		return !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9')
	})
	out := make([]string, 0, len(fields))
	seen := map[string]struct{}{}
	for _, field := range fields {
		term := strings.TrimSpace(strings.ToLower(field))
		if term == "" {
			continue
		}
		if _, ok := seen[term]; ok {
			continue
		}
		seen[term] = struct{}{}
		out = append(out, term)
	}
	return out
}

func runbookMatchScore(runbook model.MemoryRunbook, needle string, terms []string) int {
	if strings.TrimSpace(needle) == "" {
		return 0
	}
	if !runbookMatches(runbook, needle) {
		return 0
	}

	score := 0
	title := strings.ToLower(runbook.Title)
	description := strings.ToLower(runbook.Description)
	tags := make([]string, 0, len(runbook.Tags))
	for _, tag := range runbook.Tags {
		tags = append(tags, strings.ToLower(tag))
	}
	steps := make([]string, 0, len(runbook.Steps))
	for _, step := range runbook.Steps {
		steps = append(steps, strings.ToLower(step))
	}

	if strings.Contains(title, needle) {
		score += 12
	}
	if strings.Contains(description, needle) {
		score += 4
	}

	for _, term := range terms {
		if strings.Contains(title, term) {
			score += 8
		}
		if strings.Contains(description, term) {
			score += 3
		}
		for _, tag := range tags {
			if tag == term {
				score += 7
				continue
			}
			if strings.Contains(tag, term) {
				score += 5
			}
		}
		for _, step := range steps {
			if strings.Contains(step, term) {
				score += 2
				break
			}
		}
	}

	return score
}

func normalizeRunbookRequest(req model.MemoryRunbookUpsertRequest) (model.MemoryRunbook, error) {
	title := strings.TrimSpace(req.Title)
	description := strings.TrimSpace(req.Description)
	if title == "" || description == "" {
		return model.MemoryRunbook{}, os.ErrInvalid
	}
	tags := dedupeStrings(req.Tags)
	steps := dedupeStrings(req.Steps)
	if len(steps) == 0 {
		return model.MemoryRunbook{}, os.ErrInvalid
	}
	return model.MemoryRunbook{
		ID:          "",
		Title:       title,
		Tags:        tags,
		Description: description,
		Steps:       steps,
		UsageCount:  0,
		CreatedAt:   "",
		UpdatedAt:   "",
	}, nil
}

func dedupeStrings(values []string) []string {
	out := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		normalized := strings.TrimSpace(value)
		if normalized == "" {
			continue
		}
		key := strings.ToLower(normalized)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, normalized)
	}
	return out
}

func cloneRunbook(in model.MemoryRunbook) model.MemoryRunbook {
	out := in
	out.Tags = append([]string(nil), in.Tags...)
	out.Steps = append([]string(nil), in.Steps...)
	return out
}

func cloneFix(in model.MemoryFixPattern) model.MemoryFixPattern {
	out := in
	return out
}

func formatCounter(counter uint64) string {
	return strconv.FormatUint(counter, 10)
}

func defaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
