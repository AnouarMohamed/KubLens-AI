package httpapi

import (
	"errors"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"

	"kubelens-backend/internal/auth"
	"kubelens-backend/internal/model"
)

func (s *Server) handleMemoryRunbooks(w http.ResponseWriter, r *http.Request) {
	if s.memory == nil {
		writeJSON(w, http.StatusOK, []model.MemoryRunbook{})
		return
	}

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	writeJSON(w, http.StatusOK, s.memory.Search(query))
}

func (s *Server) handleCreateMemoryRunbook(w http.ResponseWriter, r *http.Request) {
	if s.memory == nil {
		writeError(w, http.StatusServiceUnavailable, "memory store is not configured")
		return
	}

	var req model.MemoryRunbookUpsertRequest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	created, err := s.memory.CreateRunbook(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid runbook payload")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleUpdateMemoryRunbook(w http.ResponseWriter, r *http.Request) {
	if s.memory == nil {
		writeError(w, http.StatusServiceUnavailable, "memory store is not configured")
		return
	}

	runbookID := strings.TrimSpace(chi.URLParam(r, "id"))
	if runbookID == "" {
		writeError(w, http.StatusBadRequest, "runbook id is required")
		return
	}

	var req model.MemoryRunbookUpsertRequest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	updated, err := s.memory.UpdateRunbook(runbookID, req)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			writeError(w, http.StatusNotFound, "runbook not found")
			return
		}
		writeError(w, http.StatusBadRequest, "invalid runbook payload")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleListMemoryFixes(w http.ResponseWriter, r *http.Request) {
	if s.memory == nil {
		writeJSON(w, http.StatusOK, []model.MemoryFixPattern{})
		return
	}

	fixes := s.memory.ListFixes()
	query := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("q")))
	if query == "" {
		writeJSON(w, http.StatusOK, fixes)
		return
	}

	filtered := make([]model.MemoryFixPattern, 0, len(fixes))
	for _, fix := range fixes {
		haystack := strings.ToLower(strings.Join([]string{
			fix.ID,
			fix.IncidentID,
			fix.ProposalID,
			fix.Title,
			fix.Description,
			fix.Resource,
			string(fix.Kind),
			fix.RecordedBy,
		}, " "))
		if strings.Contains(haystack, query) {
			filtered = append(filtered, fix)
		}
	}
	writeJSON(w, http.StatusOK, filtered)
}

func (s *Server) handleRecordMemoryFix(w http.ResponseWriter, r *http.Request) {
	if s.memory == nil {
		writeError(w, http.StatusServiceUnavailable, "memory store is not configured")
		return
	}

	var req model.MemoryFixCreateRequest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	principal, _ := auth.PrincipalFromContext(r.Context())
	fix, err := s.memory.RecordFix(req, principal.User)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid fix payload")
		return
	}
	writeJSON(w, http.StatusCreated, fix)
}
