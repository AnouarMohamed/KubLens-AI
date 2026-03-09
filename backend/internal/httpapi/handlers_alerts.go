package httpapi

import (
	"net/http"
	"strings"

	"kubelens-backend/internal/model"
)

func (s *Server) handleAlertDispatch(w http.ResponseWriter, r *http.Request) {
	if s.alerts == nil || !s.alerts.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "alert integrations are not configured")
		return
	}

	var req model.AlertDispatchRequest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	req.Message = strings.TrimSpace(req.Message)
	if req.Title == "" || req.Message == "" {
		writeError(w, http.StatusBadRequest, "title and message are required")
		return
	}

	result := s.alerts.Dispatch(r.Context(), req)
	status := http.StatusOK
	if !result.Success {
		status = http.StatusBadGateway
	}
	writeJSON(w, status, result)
}

func (s *Server) handleAlertTest(w http.ResponseWriter, r *http.Request) {
	if s.alerts == nil || !s.alerts.Enabled() {
		writeError(w, http.StatusServiceUnavailable, "alert integrations are not configured")
		return
	}

	req := model.AlertDispatchRequest{
		Title:    "KubeLens test alert",
		Message:  "This is a test alert from KubeLens diagnostics.",
		Severity: "warning",
		Source:   "kubelens",
		Tags:     []string{"test", "diagnostics"},
	}

	result := s.alerts.Dispatch(r.Context(), req)
	status := http.StatusOK
	if !result.Success {
		status = http.StatusBadGateway
	}
	writeJSON(w, status, result)
}
