package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kubelens-backend/internal/ai"
	"kubelens-backend/internal/model"
)

func TestDetectIntent(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  assistantIntent
	}{
		{name: "manifest", input: "generate deployment yaml", want: intentManifest},
		{name: "health", input: "show cluster health summary", want: intentHealth},
		{name: "priority", input: "show failed and pending pods", want: intentPriority},
		{name: "unknown", input: "hello world", want: intentUnknown},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := detectIntent(strings.ToLower(tc.input)); got != tc.want {
				t.Fatalf("detectIntent(%q) = %v, want %v", tc.input, got, tc.want)
			}
		})
	}
}

func TestFindPodByHint(t *testing.T) {
	pods := []model.PodSummary{
		{Name: "payment-gateway-7f8d9a0b-12345", Namespace: "production"},
		{Name: "auth-service-v2-5f6b7c8d9-abcde", Namespace: "production"},
	}

	pod, ok := findPodByHint(pods, "payment-gateway")
	if !ok {
		t.Fatal("expected pod match but got none")
	}
	if pod.Name != "payment-gateway-7f8d9a0b-12345" {
		t.Fatalf("unexpected pod selected: %s", pod.Name)
	}
}

func TestCollectIssueResources(t *testing.T) {
	issues := []model.DiagnosticIssue{
		{Resource: "production/payment-gateway"},
		{Resource: ""},
		{Resource: "node-worker-3"},
	}

	resources := collectIssueResources(issues)
	if len(resources) != 2 {
		t.Fatalf("expected 2 resources, got %d", len(resources))
	}
}

func TestDecodeJSONBodyRejectsTrailingJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/assistant", bytes.NewBufferString(`{"message":"hi"}{"x":1}`))
	var payload assistantRequest
	if err := decodeJSONBody(req, &payload); err == nil {
		t.Fatal("expected invalid JSON body error for trailing payload")
	}
}

func TestMetricsEndpointIncludesAssistantRoute(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(testClusterReader{}, nil, logger)
	router := server.Router("")

	assistantReq := httptest.NewRequest(http.MethodPost, "/api/assistant", strings.NewReader(`{"message":"show cluster health"}`))
	assistantReq.Header.Set("Content-Type", "application/json")
	assistantResp := httptest.NewRecorder()
	router.ServeHTTP(assistantResp, assistantReq)
	if assistantResp.Code != http.StatusOK {
		t.Fatalf("assistant status code = %d, want 200", assistantResp.Code)
	}

	metricsReq := httptest.NewRequest(http.MethodGet, "/api/metrics", nil)
	metricsResp := httptest.NewRecorder()
	router.ServeHTTP(metricsResp, metricsReq)
	if metricsResp.Code != http.StatusOK {
		t.Fatalf("metrics status code = %d, want 200", metricsResp.Code)
	}

	var snap metricsSnapshot
	if err := json.NewDecoder(metricsResp.Body).Decode(&snap); err != nil {
		t.Fatalf("failed to decode metrics response: %v", err)
	}
	if snap.TotalRequests < 1 {
		t.Fatalf("total requests = %d, want at least 1", snap.TotalRequests)
	}

	foundAssistant := false
	for _, item := range snap.Routes {
		if item.Route == "POST /api/assistant" {
			foundAssistant = true
			if item.Requests < 1 {
				t.Fatalf("assistant route requests = %d, want >= 1", item.Requests)
			}
		}
	}
	if !foundAssistant {
		t.Fatal("expected assistant route metrics entry")
	}
}

func TestAssistantUsesProviderWhenAvailable(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithAIProvider(testAIProvider{answer: "enhanced answer from provider"}),
	)
	router := server.Router("")

	req := httptest.NewRequest(http.MethodPost, "/api/assistant", strings.NewReader(`{"message":"show cluster health"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status code = %d, want 200", rr.Code)
	}

	var payload model.AssistantResponse
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Answer != "enhanced answer from provider" {
		t.Fatalf("unexpected provider answer: %q", payload.Answer)
	}
}

func TestAssistantFallsBackWhenProviderFails(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithAIProvider(testAIProvider{err: errors.New("provider timeout")}),
	)
	router := server.Router("")

	req := httptest.NewRequest(http.MethodPost, "/api/assistant", strings.NewReader(`{"message":"show cluster health"}`))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status code = %d, want 200", rr.Code)
	}

	var payload model.AssistantResponse
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !strings.Contains(payload.Answer, "Cluster Health Score") {
		t.Fatalf("expected deterministic fallback answer, got: %q", payload.Answer)
	}
}

func TestResourcesEndpoint(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(testClusterReader{}, nil, logger)
	router := server.Router("")

	req := httptest.NewRequest(http.MethodGet, "/api/resources/deployments", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status code = %d, want 200", rr.Code)
	}

	var payload model.ResourceList
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Kind != "deployments" {
		t.Fatalf("kind = %q, want deployments", payload.Kind)
	}
	if len(payload.Items) == 0 {
		t.Fatal("expected at least one resource item")
	}
}

func TestActionEndpoints(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(testClusterReader{}, nil, logger)
	router := server.Router("")

	tests := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{
			name:   "create pod",
			method: http.MethodPost,
			path:   "/api/pods",
			body:   `{"namespace":"default","name":"test-pod","image":"nginx:latest"}`,
		},
		{
			name:   "restart pod",
			method: http.MethodPost,
			path:   "/api/pods/default/test-pod/restart",
		},
		{
			name:   "delete pod",
			method: http.MethodDelete,
			path:   "/api/pods/default/test-pod",
		},
		{
			name:   "cordon node",
			method: http.MethodPost,
			path:   "/api/nodes/node-1/cordon",
		},
		{
			name:   "get resource yaml",
			method: http.MethodGet,
			path:   "/api/resources/deployments/production/payment-gateway/yaml",
		},
		{
			name:   "apply resource yaml",
			method: http.MethodPut,
			path:   "/api/resources/deployments/production/payment-gateway/yaml",
			body:   `{"yaml":"apiVersion: apps/v1\nkind: Deployment"}`,
		},
		{
			name:   "scale resource",
			method: http.MethodPost,
			path:   "/api/resources/deployments/production/payment-gateway/scale",
			body:   `{"replicas":3}`,
		},
		{
			name:   "restart resource",
			method: http.MethodPost,
			path:   "/api/resources/deployments/production/payment-gateway/restart",
		},
		{
			name:   "rollback resource",
			method: http.MethodPost,
			path:   "/api/resources/deployments/production/payment-gateway/rollback",
		},
		{
			name:   "terminal exec",
			method: http.MethodPost,
			path:   "/api/terminal/exec",
			body:   `{"command":"echo ok"}`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			if tc.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)
			if rr.Code != http.StatusOK {
				t.Fatalf("status code = %d, want 200", rr.Code)
			}
		})
	}
}

func TestVersionEndpoint(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithBuildInfo(model.BuildInfo{
			Version: "v-test",
			Commit:  "abc1234",
			BuiltAt: "2026-03-07T00:00:00Z",
		}),
	)
	router := server.Router("")

	req := httptest.NewRequest(http.MethodGet, "/api/version", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status code = %d, want 200", rr.Code)
	}

	var payload model.BuildInfo
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Version != "v-test" || payload.Commit != "abc1234" {
		t.Fatalf("unexpected version payload: %+v", payload)
	}
}

func TestPredictionsEndpointUsesFallback(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(testClusterReader{}, nil, logger)
	router := server.Router("")

	req := httptest.NewRequest(http.MethodGet, "/api/predictions", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status code = %d, want 200", rr.Code)
	}

	var payload model.PredictionsResult
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Source == "" {
		t.Fatal("prediction source should be set")
	}
	if payload.GeneratedAt == "" {
		t.Fatal("prediction timestamp should be set")
	}
	if len(payload.Items) == 0 {
		t.Fatal("expected at least one prediction")
	}
}

type testClusterReader struct{}

func (testClusterReader) IsRealCluster() bool { return true }

func (testClusterReader) Snapshot(context.Context) ([]model.PodSummary, []model.NodeSummary) {
	return []model.PodSummary{
			{Name: "payment-gateway-1", Namespace: "production", Status: model.PodStatusFailed, Restarts: 4},
		}, []model.NodeSummary{
			{Name: "node-1", Status: model.NodeStatusReady},
		}
}

func (testClusterReader) ListNamespaces(context.Context) []string {
	return []string{"production"}
}

func (testClusterReader) ListResources(context.Context, string) ([]model.ResourceRecord, error) {
	return []model.ResourceRecord{{ID: "1", Name: "sample", Status: "ok", Age: "1m"}}, nil
}

func (testClusterReader) ListClusterEvents(context.Context) []model.K8sEvent {
	return []model.K8sEvent{{Reason: "BackOff", Type: "Warning", Age: "1m", From: "kubelet", Message: "sample"}}
}

func (testClusterReader) GetResourceYAML(context.Context, string, string, string) (string, error) {
	return "apiVersion: apps/v1\nkind: Deployment", nil
}

func (testClusterReader) ApplyResourceYAML(context.Context, string, string, string, string) (model.ActionResult, error) {
	return model.ActionResult{Success: true, Message: "applied"}, nil
}

func (testClusterReader) ScaleResource(context.Context, string, string, string, int32) (model.ActionResult, error) {
	return model.ActionResult{Success: true, Message: "scaled"}, nil
}

func (testClusterReader) RestartResource(context.Context, string, string, string) (model.ActionResult, error) {
	return model.ActionResult{Success: true, Message: "restarted"}, nil
}

func (testClusterReader) RollbackResource(context.Context, string, string, string) (model.ActionResult, error) {
	return model.ActionResult{Success: true, Message: "rolled back"}, nil
}

func (testClusterReader) PodEvents(context.Context, string, string) []model.K8sEvent {
	return []model.K8sEvent{{Reason: "BackOff"}}
}

func (testClusterReader) PodLogs(context.Context, string, string) string {
	return "dependency connection timeout"
}

func (testClusterReader) PodDetail(context.Context, string, string) (model.PodDetail, error) {
	return model.PodDetail{}, nil
}

func (testClusterReader) NodeDetail(context.Context, string) (model.NodeDetail, error) {
	return model.NodeDetail{}, nil
}

func (testClusterReader) CreatePod(context.Context, model.PodCreateRequest) (model.ActionResult, error) {
	return model.ActionResult{Success: true, Message: "created"}, nil
}

func (testClusterReader) RestartPod(context.Context, string, string) (model.ActionResult, error) {
	return model.ActionResult{Success: true, Message: "restarted"}, nil
}

func (testClusterReader) DeletePod(context.Context, string, string) (model.ActionResult, error) {
	return model.ActionResult{Success: true, Message: "deleted"}, nil
}

func (testClusterReader) CordonNode(context.Context, string) (model.ActionResult, error) {
	return model.ActionResult{Success: true, Message: "cordoned"}, nil
}

type testAIProvider struct {
	answer string
	err    error
}

func (testAIProvider) Name() string { return "test-provider" }

func (p testAIProvider) Generate(context.Context, ai.Input) (string, error) {
	if p.err != nil {
		return "", p.err
	}
	return p.answer, nil
}
