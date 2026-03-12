package httpapi

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"kubelens-backend/internal/auth"
	"kubelens-backend/internal/model"
)

func (s *Server) handleGetResourceYAML(w http.ResponseWriter, r *http.Request) {
	kind := strings.TrimSpace(chi.URLParam(r, "kind"))
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))

	yamlText, err := s.cluster.GetResourceYAML(r.Context(), kind, namespace, name)
	if err != nil {
		handleActionError(w, err, "Resource not found")
		return
	}

	writeJSON(w, http.StatusOK, model.ResourceManifest{YAML: yamlText})
}

func (s *Server) handleApplyResourceYAML(w http.ResponseWriter, r *http.Request) {
	kind := strings.TrimSpace(chi.URLParam(r, "kind"))
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))

	var req model.ResourceManifest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	pods, nodes := s.cluster.Snapshot(r.Context())
	risk := s.evaluateManifestRisk(req.YAML, pods, nodes)
	force := queryBool(r, "force")
	if risk.Score >= 50 && !force {
		writeJSON(w, http.StatusAccepted, model.ResourceApplyRiskResponse{
			Message:       "Risk guard blocked apply. Review the report and retry with force=true if override is justified.",
			RequiresForce: true,
			Report:        risk,
		})
		return
	}
	if risk.Score >= 50 && force && s.audit != nil {
		entry := model.AuditEntry{
			Timestamp: s.now().UTC().Format(time.RFC3339),
			RequestID: middleware.GetReqID(r.Context()),
			Method:    r.Method,
			Path:      sanitizeAuditPath(r.URL.Path),
			Action:    fmt.Sprintf("resource.apply.force_override riskScore=%d", risk.Score),
			Status:    http.StatusOK,
			ClientIP:  sanitizeClientIP(r.RemoteAddr),
			Success:   true,
		}
		if principal, ok := auth.PrincipalFromContext(r.Context()); ok {
			entry.User = principal.User
			entry.Role = auth.RoleLabel(principal.Role)
		}
		s.audit.append(entry)
	}

	result, err := s.cluster.ApplyResourceYAML(r.Context(), kind, namespace, name, req.YAML)
	if err != nil {
		handleActionError(w, err, "Resource not found")
		return
	}

	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleScaleResource(w http.ResponseWriter, r *http.Request) {
	kind := strings.TrimSpace(chi.URLParam(r, "kind"))
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))

	var req model.ScaleRequest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := s.cluster.ScaleResource(r.Context(), kind, namespace, name, req.Replicas)
	if err != nil {
		handleActionError(w, err, "Resource not found")
		return
	}

	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleRestartResource(w http.ResponseWriter, r *http.Request) {
	kind := strings.TrimSpace(chi.URLParam(r, "kind"))
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))

	result, err := s.cluster.RestartResource(r.Context(), kind, namespace, name)
	if err != nil {
		handleActionError(w, err, "Resource not found")
		return
	}
	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleRollbackResource(w http.ResponseWriter, r *http.Request) {
	kind := strings.TrimSpace(chi.URLParam(r, "kind"))
	namespace := strings.TrimSpace(chi.URLParam(r, "namespace"))
	name := strings.TrimSpace(chi.URLParam(r, "name"))

	result, err := s.cluster.RollbackResource(r.Context(), kind, namespace, name)
	if err != nil {
		handleActionError(w, err, "Resource not found")
		return
	}
	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}
