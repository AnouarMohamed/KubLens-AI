package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kubelens-backend/internal/model"
)

func TestAssistantReferenceFeedbackEndpointRecordsSignal(t *testing.T) {
	retriever := &testRAGDocsRetriever{
		enabled: true,
	}
	router := newOpsTestServer(t, WithDocsRetriever(retriever)).Router("")

	body := `{"query":"payment-gateway oomkilled","url":"https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/","helpful":true}`
	req := httptest.NewRequest(http.MethodPost, "/api/assistant/references/feedback", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer viewer-token")
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	if resp.Code != http.StatusOK {
		t.Fatalf("feedback status = %d, want 200", resp.Code)
	}

	var result model.ActionResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode action result: %v", err)
	}
	if !result.Success {
		t.Fatalf("expected success=true, got %#v", result)
	}
	if len(retriever.feedbackCalls) != 1 {
		t.Fatalf("feedback calls = %d, want 1", len(retriever.feedbackCalls))
	}
	if !retriever.feedbackCalls[0].helpful {
		t.Fatal("expected helpful feedback flag")
	}

	auditReq := httptest.NewRequest(http.MethodGet, "/api/audit?limit=40", nil)
	auditReq.Header.Set("Authorization", "Bearer admin-token")
	auditResp := httptest.NewRecorder()
	router.ServeHTTP(auditResp, auditReq)
	if auditResp.Code != http.StatusOK {
		t.Fatalf("audit status = %d, want 200", auditResp.Code)
	}
	var payload model.AuditLogResponse
	if err := json.NewDecoder(auditResp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode audit payload: %v", err)
	}
	found := false
	for _, item := range payload.Items {
		if item.Action == "assistant.reference.feedback" {
			found = true
			break
		}
	}
	if !found {
		t.Fatal("expected assistant.reference.feedback audit action")
	}
}

func TestRAGTelemetryAndMetricsExposeRetrievalSignals(t *testing.T) {
	retriever := &testRAGDocsRetriever{
		enabled: true,
		telemetry: model.RAGTelemetry{
			Enabled:          true,
			IndexedAt:        "2026-03-11T10:00:00Z",
			ExpiresAt:        "2026-03-11T16:00:00Z",
			TotalQueries:     24,
			EmptyResults:     4,
			HitRate:          0.8333,
			AverageResults:   2.4,
			FeedbackSignals:  8,
			PositiveFeedback: 6,
			NegativeFeedback: 2,
			TopFeedbackDocs: []model.RAGDocFeedback{
				{
					URL:        "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/",
					Helpful:    5,
					NotHelpful: 1,
					NetScore:   4,
					UpdatedAt:  "2026-03-11T11:00:00Z",
				},
			},
			RecentQueries: []model.RAGQueryTrace{
				{
					Timestamp:      "2026-03-11T11:20:00Z",
					Query:          "oomkilled payment-gateway",
					QueryTerms:     []string{"oomkilled", "payment-gateway"},
					UsedSemantic:   true,
					CandidateCount: 12,
					ResultCount:    3,
					DurationMs:     21.5,
					TopResults: []model.RAGResultTrace{
						{
							Title:         "Kubernetes OOMKilled",
							URL:           "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/",
							Source:        "kubernetes",
							FinalScore:    0.92,
							LexicalScore:  0.8,
							SemanticScore: 0.9,
							CoverageScore: 1.0,
							SourceBoost:   0.7,
							FeedbackBoost: 0.4,
						},
					},
				},
			},
		},
	}
	router := newOpsTestServer(t, WithDocsRetriever(retriever)).Router("")

	telemetryReq := httptest.NewRequest(http.MethodGet, "/api/rag/telemetry?limit=5", nil)
	telemetryReq.Header.Set("Authorization", "Bearer viewer-token")
	telemetryResp := httptest.NewRecorder()
	router.ServeHTTP(telemetryResp, telemetryReq)
	if telemetryResp.Code != http.StatusOK {
		t.Fatalf("telemetry status = %d, want 200", telemetryResp.Code)
	}

	var telemetry model.RAGTelemetry
	if err := json.NewDecoder(telemetryResp.Body).Decode(&telemetry); err != nil {
		t.Fatalf("decode telemetry: %v", err)
	}
	if telemetry.TotalQueries != 24 || telemetry.EmptyResults != 4 {
		t.Fatalf("unexpected telemetry counters: %+v", telemetry)
	}
	if len(telemetry.RecentQueries) != 1 {
		t.Fatalf("recent query traces = %d, want 1", len(telemetry.RecentQueries))
	}

	metricsReq := httptest.NewRequest(http.MethodGet, "/api/metrics", nil)
	metricsReq.Header.Set("Authorization", "Bearer viewer-token")
	metricsResp := httptest.NewRecorder()
	router.ServeHTTP(metricsResp, metricsReq)
	if metricsResp.Code != http.StatusOK {
		t.Fatalf("metrics status = %d, want 200", metricsResp.Code)
	}
	var snapshot metricsSnapshot
	if err := json.NewDecoder(metricsResp.Body).Decode(&snapshot); err != nil {
		t.Fatalf("decode metrics snapshot: %v", err)
	}
	if snapshot.RAG.TotalQueries != 24 || snapshot.RAG.PositiveFeedback != 6 {
		t.Fatalf("unexpected rag metrics summary: %+v", snapshot.RAG)
	}

	promReq := httptest.NewRequest(http.MethodGet, "/api/metrics/prometheus", nil)
	promReq.Header.Set("Authorization", "Bearer viewer-token")
	promResp := httptest.NewRecorder()
	router.ServeHTTP(promResp, promReq)
	if promResp.Code != http.StatusOK {
		t.Fatalf("prometheus metrics status = %d, want 200", promResp.Code)
	}
	body := promResp.Body.String()
	for _, key := range []string{
		"kubelens_rag_queries_total",
		"kubelens_rag_empty_results_total",
		"kubelens_rag_feedback_positive_total",
	} {
		if !strings.Contains(body, key) {
			t.Fatalf("expected prometheus metric %q in output", key)
		}
	}
}

type testRAGDocsRetriever struct {
	enabled bool

	telemetry model.RAGTelemetry

	feedbackCalls []testRAGFeedbackCall
}

type testRAGFeedbackCall struct {
	query   string
	url     string
	helpful bool
}

func (d *testRAGDocsRetriever) Enabled() bool {
	return d.enabled
}

func (d *testRAGDocsRetriever) Retrieve(_ context.Context, _ string, _ int) []model.DocumentationReference {
	return []model.DocumentationReference{
		{
			Title:   "Kubernetes OOMKilled",
			URL:     "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/",
			Source:  "kubernetes",
			Snippet: "OOMKilled indicates memory limits were exceeded.",
		},
	}
}

func (d *testRAGDocsRetriever) RecordFeedback(query, url string, helpful bool) bool {
	d.feedbackCalls = append(d.feedbackCalls, testRAGFeedbackCall{
		query:   query,
		url:     url,
		helpful: helpful,
	})
	return true
}

func (d *testRAGDocsRetriever) TelemetrySnapshot(_ int) model.RAGTelemetry {
	return d.telemetry
}
