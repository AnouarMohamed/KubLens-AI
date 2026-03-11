package httpapi

import (
	"net/http"
	"strconv"
	"strings"

	"kubelens-backend/internal/model"
)

const (
	defaultRAGTelemetryLimit = 24
	maxRAGTelemetryLimit     = 80
)

type docsFeedbackRecorder interface {
	RecordFeedback(query, url string, helpful bool) bool
}

type docsTelemetryProvider interface {
	TelemetrySnapshot(limit int) model.RAGTelemetry
}

type assistantReferenceFeedbackRequest struct {
	Query   string `json:"query"`
	URL     string `json:"url"`
	Helpful *bool  `json:"helpful"`
}

func (s *Server) handleAssistantReferenceFeedback(w http.ResponseWriter, r *http.Request) {
	var req assistantReferenceFeedbackRequest
	if err := s.decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	url := strings.TrimSpace(req.URL)
	if url == "" {
		writeError(w, http.StatusBadRequest, "url is required")
		return
	}
	if req.Helpful == nil {
		writeError(w, http.StatusBadRequest, "helpful is required")
		return
	}
	if len(strings.TrimSpace(req.Query)) > 1200 {
		writeError(w, http.StatusBadRequest, "query is too long")
		return
	}

	if s.docs == nil || !s.docs.Enabled() {
		writeJSON(w, http.StatusOK, model.ActionResult{
			Success: false,
			Message: "documentation retriever is disabled; feedback not applied",
		})
		return
	}

	recorder, ok := s.docs.(docsFeedbackRecorder)
	if !ok {
		writeJSON(w, http.StatusOK, model.ActionResult{
			Success: false,
			Message: "documentation retriever does not support feedback",
		})
		return
	}

	if !recorder.RecordFeedback(req.Query, url, *req.Helpful) {
		writeError(w, http.StatusBadRequest, "feedback could not be recorded")
		return
	}

	writeJSON(w, http.StatusOK, model.ActionResult{
		Success: true,
		Message: "reference feedback recorded",
	})
}

func (s *Server) handleRAGTelemetry(w http.ResponseWriter, r *http.Request) {
	limit := parseRAGTelemetryLimit(r.URL.Query().Get("limit"))
	writeJSON(w, http.StatusOK, ragTelemetryFromRetriever(s.docs, limit))
}

func parseRAGTelemetryLimit(raw string) int {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return defaultRAGTelemetryLimit
	}
	value, err := strconv.Atoi(trimmed)
	if err != nil || value <= 0 {
		return defaultRAGTelemetryLimit
	}
	if value > maxRAGTelemetryLimit {
		return maxRAGTelemetryLimit
	}
	return value
}

func ragTelemetryFromRetriever(retriever docsRetriever, limit int) model.RAGTelemetry {
	if retriever == nil {
		return model.RAGTelemetry{
			Enabled:         false,
			TopFeedbackDocs: []model.RAGDocFeedback{},
			RecentQueries:   []model.RAGQueryTrace{},
		}
	}

	provider, ok := retriever.(docsTelemetryProvider)
	if !ok {
		return model.RAGTelemetry{
			Enabled:         retriever.Enabled(),
			TopFeedbackDocs: []model.RAGDocFeedback{},
			RecentQueries:   []model.RAGQueryTrace{},
		}
	}

	snapshot := provider.TelemetrySnapshot(limit)
	if snapshot.TopFeedbackDocs == nil {
		snapshot.TopFeedbackDocs = []model.RAGDocFeedback{}
	}
	if snapshot.RecentQueries == nil {
		snapshot.RecentQueries = []model.RAGQueryTrace{}
	}
	return snapshot
}

func ragMetricsFromRetriever(retriever docsRetriever) ragMetricsSummary {
	snapshot := ragTelemetryFromRetriever(retriever, 1)
	return ragMetricsSummary{
		Enabled:          snapshot.Enabled,
		TotalQueries:     snapshot.TotalQueries,
		EmptyResults:     snapshot.EmptyResults,
		HitRate:          snapshot.HitRate,
		AverageResults:   snapshot.AverageResults,
		FeedbackSignals:  snapshot.FeedbackSignals,
		PositiveFeedback: snapshot.PositiveFeedback,
		NegativeFeedback: snapshot.NegativeFeedback,
	}
}
