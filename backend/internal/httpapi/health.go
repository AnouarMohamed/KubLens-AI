package httpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5/middleware"

	"kubelens-backend/internal/model"
)

const readinessClusterTimeout = 2 * time.Second

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"timestamp": s.now().UTC().Format(time.RFC3339),
		"version":   s.buildInfo.Version,
		"commit":    s.buildInfo.Commit,
	})
}

func (s *Server) handleReadyz(w http.ResponseWriter, r *http.Request) {
	checks := make([]model.HealthCheck, 0, 3)
	overallOK := true

	clusterCheck := s.clusterReadinessCheck(r.Context())
	checks = append(checks, clusterCheck)
	if !clusterCheck.OK {
		overallOK = false
	}

	predictorCheck := s.predictorReadinessCheck()
	checks = append(checks, predictorCheck)
	if !predictorCheck.OK {
		overallOK = false
	}

	authOK := !(s.runtime.Mode == "prod" && !s.runtime.AuthEnabled)
	authMessage := "configured"
	if !authOK {
		authMessage = "prod-requires-auth"
	}
	authCheck := model.HealthCheck{
		Name:    "auth",
		OK:      authOK,
		Message: authMessage,
	}
	checks = append(checks, authCheck)

	status := "ok"
	httpStatus := http.StatusOK
	if !overallOK {
		status = "degraded"
		httpStatus = http.StatusServiceUnavailable
		s.logger.WarnContext(r.Context(), "readiness_degraded",
			"request_id", middleware.GetReqID(r.Context()),
			"cluster_ok", clusterCheck.OK,
			"predictor_ok", predictorCheck.OK,
			"predictor_message", predictorCheck.Message,
		)
	}

	writeJSON(w, httpStatus, model.HealthStatus{
		Status:    status,
		Timestamp: s.now().UTC().Format(time.RFC3339),
		Checks:    checks,
		Build:     s.buildInfo,
	})
}

func (s *Server) clusterReadinessCheck(parent context.Context) model.HealthCheck {
	if !s.cluster.IsRealCluster() {
		return model.HealthCheck{
			Name:    "cluster",
			OK:      true,
			Message: "mock-mode",
		}
	}

	ctx, cancel := context.WithTimeout(parent, readinessClusterTimeout)
	defer cancel()

	_, _ = s.cluster.Snapshot(ctx)
	if ctx.Err() == nil {
		return model.HealthCheck{
			Name:    "cluster",
			OK:      true,
			Message: "reachable",
		}
	}
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return model.HealthCheck{
			Name:    "cluster",
			OK:      false,
			Message: "timeout",
		}
	}
	return model.HealthCheck{
		Name:    "cluster",
		OK:      false,
		Message: "cancelled",
	}
}

func (s *Server) predictorReadinessCheck() model.HealthCheck {
	state := s.predictorHealthSnapshot()
	if !state.enabled {
		return model.HealthCheck{
			Name:    "predictor",
			OK:      true,
			Message: "disabled",
		}
	}

	check := model.HealthCheck{
		Name:    "predictor",
		OK:      true,
		Message: "healthy",
	}
	if !state.lastSuccess.IsZero() {
		check.LastSuccess = state.lastSuccess.UTC().Format(time.RFC3339)
	}
	if !state.lastFailure.IsZero() {
		check.LastFailure = state.lastFailure.UTC().Format(time.RFC3339)
	}
	if state.lastFailure.After(state.lastSuccess) {
		check.OK = false
		if state.lastError != "" {
			check.Message = state.lastError
		} else {
			check.Message = "unavailable"
		}
	}
	return check
}

func (s *Server) runtimeSnapshot() model.RuntimeStatus {
	runtime := s.runtime
	state := s.predictorHealthSnapshot()
	if !runtime.PredictorEnabled {
		runtime.PredictorHealthy = true
		runtime.PredictorLastError = ""
		return runtime
	}

	runtime.PredictorHealthy = !state.lastFailure.After(state.lastSuccess)
	runtime.PredictorLastError = state.lastError
	return runtime
}

func (s *Server) recordPredictorSuccess() {
	s.predictorHealthMu.Lock()
	s.predictorHealth.lastSuccess = s.now()
	s.predictorHealth.lastError = ""
	s.predictorHealthMu.Unlock()
}

func (s *Server) recordPredictorFailure(err error) {
	if err == nil {
		return
	}
	s.predictorHealthMu.Lock()
	s.predictorHealth.lastFailure = s.now()
	s.predictorHealth.lastError = err.Error()
	s.predictorHealthMu.Unlock()
}

func (s *Server) predictorHealthSnapshot() predictorHealthState {
	s.predictorHealthMu.RLock()
	defer s.predictorHealthMu.RUnlock()
	return s.predictorHealth
}
