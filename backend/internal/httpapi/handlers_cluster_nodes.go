package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"kubelens-backend/internal/apperrors"
	"kubelens-backend/internal/auth"
	"kubelens-backend/internal/model"
)

type nodeMaintenanceReader interface {
	DrainNodePreview(ctx context.Context, name string) (model.NodeDrainPreview, error)
}

type nodeMaintenanceWriter interface {
	UncordonNode(ctx context.Context, name string) (model.ActionResult, error)
	DrainNode(ctx context.Context, name string, force bool) (model.ActionResult, error)
}

type nodeScopeReader interface {
	NodePods(ctx context.Context, name string) ([]model.PodSummary, error)
	NodeEvents(ctx context.Context, name string) ([]model.K8sEvent, error)
}

func (s *Server) handleNodeDetail(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	node, err := s.cluster.NodeDetail(r.Context(), name)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Node not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "Failed to fetch node details")
		return
	}
	writeJSON(w, http.StatusOK, node)
}

func (s *Server) handleNodePods(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if name == "" {
		writeError(w, http.StatusBadRequest, "node name is required")
		return
	}

	if provider, ok := s.cluster.(nodeScopeReader); ok {
		pods, err := provider.NodePods(r.Context(), name)
		if err != nil {
			if errors.Is(err, apperrors.ErrNotFound) {
				writeError(w, http.StatusNotFound, "Node not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "Failed to fetch node pods")
			return
		}
		writeJSON(w, http.StatusOK, pods)
		return
	}

	pods, _ := s.cluster.Snapshot(r.Context())
	out := make([]model.PodSummary, 0, len(pods))
	for _, pod := range pods {
		if pod.NodeName == name {
			out = append(out, pod)
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleNodeEvents(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if name == "" {
		writeError(w, http.StatusBadRequest, "node name is required")
		return
	}

	if provider, ok := s.cluster.(nodeScopeReader); ok {
		events, err := provider.NodeEvents(r.Context(), name)
		if err != nil {
			if errors.Is(err, apperrors.ErrNotFound) {
				writeError(w, http.StatusNotFound, "Node not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "Failed to fetch node events")
			return
		}
		writeJSON(w, http.StatusOK, events)
		return
	}

	events := s.cluster.ListClusterEvents(r.Context())
	out := make([]model.K8sEvent, 0, len(events))
	for _, event := range events {
		if !strings.EqualFold(event.ResourceKind, "Node") {
			continue
		}
		if event.Resource != name {
			continue
		}
		out = append(out, event)
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleCordonNode(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	result, err := s.cluster.CordonNode(r.Context(), name)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Node not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleUncordonNode(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	provider, ok := s.cluster.(nodeMaintenanceWriter)
	if !ok {
		writeError(w, http.StatusNotImplemented, "uncordon is not supported by the active cluster provider")
		return
	}

	result, err := provider.UncordonNode(r.Context(), name)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Node not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleNodeDrainPreview(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	provider, ok := s.cluster.(nodeMaintenanceReader)
	if !ok {
		writeError(w, http.StatusNotImplemented, "node drain preview is not supported by the active cluster provider")
		return
	}

	preview, err := provider.DrainNodePreview(r.Context(), name)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Node not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, preview)
}

func (s *Server) handleDrainNode(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	var req model.NodeDrainRequest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	force := req.Force || queryBool(r, "force")
	forceReason := strings.TrimSpace(req.Reason)
	if force {
		if len(forceReason) > 240 {
			forceReason = forceReason[:240]
		}
		principal, ok := auth.PrincipalFromContext(r.Context())
		if !ok || principal.Role < auth.RoleAdmin {
			writeError(w, http.StatusForbidden, "force drain requires admin role")
			return
		}
		if forceReason == "" {
			writeError(w, http.StatusBadRequest, "force drain reason is required")
			return
		}
	}

	provider, ok := s.cluster.(nodeMaintenanceWriter)
	if !ok {
		writeError(w, http.StatusNotImplemented, "node drain is not supported by the active cluster provider")
		return
	}

	result, err := provider.DrainNode(r.Context(), name, force)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Node not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if force && s.audit != nil {
		entry := model.AuditEntry{
			Timestamp: s.now().UTC().Format(time.RFC3339),
			RequestID: middleware.GetReqID(r.Context()),
			Method:    r.Method,
			Path:      sanitizeAuditPath(r.URL.Path),
			Action:    fmt.Sprintf("node.drain.force_override reason=%q", forceReason),
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
	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}
