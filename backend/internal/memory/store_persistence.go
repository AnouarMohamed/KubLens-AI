package memory

import (
	"encoding/json"
	"os"
	"path/filepath"

	"kubelens-backend/internal/model"
)

type diskState struct {
	Counter  uint64                   `json:"counter"`
	Runbooks []model.MemoryRunbook    `json:"runbooks"`
	Fixes    []model.MemoryFixPattern `json:"fixes"`
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
