package httpapi

import (
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"kubelens-backend/internal/apperrors"
	"kubelens-backend/internal/model"
)

func (s *Server) handleCreatePod(w http.ResponseWriter, r *http.Request) {
	var req model.PodCreateRequest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := s.cluster.CreatePod(r.Context(), req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handlePodEvents(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	writeJSON(w, http.StatusOK, s.cluster.PodEvents(r.Context(), namespace, name))
}

func (s *Server) handlePodLogs(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	container := strings.TrimSpace(r.URL.Query().Get("container"))
	lines := parsePositiveIntWithMax(r.URL.Query().Get("lines"), 50, 500)
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte(s.cluster.PodLogs(r.Context(), namespace, name, container, lines)))
}

func (s *Server) handlePodLogsStream(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")
	container := strings.TrimSpace(r.URL.Query().Get("container"))
	lines := parsePositiveIntWithMax(r.URL.Query().Get("lines"), 50, 500)

	stream, err := s.cluster.StreamPodLogs(r.Context(), namespace, name, container, lines)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to stream pod logs")
		return
	}
	defer stream.Close()

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")

	_, _ = io.Copy(w, stream)
}

func (s *Server) handlePodDescribe(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	pod, err := s.cluster.PodDetail(r.Context(), namespace, name)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Pod not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "Failed to describe pod")
		return
	}
	events := s.cluster.PodEvents(r.Context(), namespace, name)

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte(renderPodDescribe(pod, events)))
}

func (s *Server) handleRestartPod(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	result, err := s.cluster.RestartPod(r.Context(), namespace, name)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Pod not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleDeletePod(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	result, err := s.cluster.DeletePod(r.Context(), namespace, name)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Pod not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	s.invalidatePredictionsCache()
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handlePodDetail(w http.ResponseWriter, r *http.Request) {
	namespace := chi.URLParam(r, "namespace")
	name := chi.URLParam(r, "name")

	pod, err := s.cluster.PodDetail(r.Context(), namespace, name)
	if err != nil {
		if errors.Is(err, apperrors.ErrNotFound) {
			writeError(w, http.StatusNotFound, "Pod not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "Failed to fetch pod details")
		return
	}
	writeJSON(w, http.StatusOK, pod)
}
