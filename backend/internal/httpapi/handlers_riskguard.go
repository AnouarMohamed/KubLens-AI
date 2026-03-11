package httpapi

import (
	"net/http"
	"strings"

	"kubelens-backend/internal/model"
	"kubelens-backend/internal/riskguard"
)

func (s *Server) handleAnalyzeRiskGuard(w http.ResponseWriter, r *http.Request) {
	var req model.RiskAnalyzeRequest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	manifest := strings.TrimSpace(req.Manifest)
	if manifest == "" {
		writeError(w, http.StatusBadRequest, "manifest is required")
		return
	}

	pods, nodes := s.cluster.Snapshot(r.Context())
	report := riskguard.Analyze(manifest, pods, nodes)
	if s.riskGuard != nil {
		report = s.riskGuard.Analyze(manifest, pods, nodes)
	}
	writeJSON(w, http.StatusOK, report)
}

func (s *Server) evaluateManifestRisk(manifest string, pods []model.PodSummary, nodes []model.NodeSummary) model.RiskReport {
	if s.riskGuard != nil {
		return s.riskGuard.Analyze(manifest, pods, nodes)
	}
	return model.RiskReport{
		Score:   0,
		Level:   "LOW",
		Summary: "LOW — deploy with standard monitoring",
		Checks:  []model.RiskCheck{},
	}
}
