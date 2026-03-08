package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAPIContractCoreEndpoints(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(testClusterReader{}, nil, logger)
	router := server.Router("")

	tests := []struct {
		name         string
		path         string
		requiredKeys []string
	}{
		{
			name: "healthz",
			path: "/api/healthz",
			requiredKeys: []string{
				"status", "timestamp", "version", "commit",
			},
		},
		{
			name: "readyz",
			path: "/api/readyz",
			requiredKeys: []string{
				"status", "timestamp", "checks", "build",
			},
		},
		{
			name: "version",
			path: "/api/version",
			requiredKeys: []string{
				"version", "commit", "builtAt",
			},
		},
		{
			name: "runtime",
			path: "/api/runtime",
			requiredKeys: []string{
				"mode", "devMode", "insecure", "isRealCluster", "authEnabled",
				"writeActionsEnabled", "terminalEnabled", "predictorEnabled", "predictorHealthy",
				"assistantEnabled", "ragEnabled", "alertsEnabled", "warnings",
			},
		},
		{
			name: "stats",
			path: "/api/stats",
			requiredKeys: []string{
				"pods", "nodes", "cluster",
			},
		},
		{
			name: "diagnostics",
			path: "/api/diagnostics",
			requiredKeys: []string{
				"summary", "timestamp", "criticalIssues", "warningIssues", "healthScore", "issues",
			},
		},
		{
			name: "predictions",
			path: "/api/predictions",
			requiredKeys: []string{
				"source", "generatedAt", "items",
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, tc.path, nil)
			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)
			if rr.Code != http.StatusOK {
				t.Fatalf("status code = %d, want 200", rr.Code)
			}

			var payload map[string]any
			if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			assertHasKeys(t, payload, tc.requiredKeys...)
		})
	}
}

func TestAPIContractCollections(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(testClusterReader{}, nil, logger)
	router := server.Router("")

	t.Run("pods list item shape", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/pods", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("status code = %d, want 200", rr.Code)
		}

		var payload []map[string]any
		if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		if len(payload) == 0 {
			t.Fatal("expected at least one pod item")
		}
		assertHasKeys(t, payload[0], "name", "namespace", "status", "cpu", "memory", "age", "restarts")
	})

	t.Run("predictions item shape", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/predictions", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("status code = %d, want 200", rr.Code)
		}

		var payload map[string]any
		if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
			t.Fatalf("decode response: %v", err)
		}
		assertHasKeys(t, payload, "source", "generatedAt", "items")

		itemsRaw, ok := payload["items"].([]any)
		if !ok || len(itemsRaw) == 0 {
			t.Fatal("expected at least one prediction item")
		}
		first, ok := itemsRaw[0].(map[string]any)
		if !ok {
			t.Fatal("prediction item is not an object")
		}
		assertHasKeys(t, first, "id", "resourceKind", "resource", "riskScore", "confidence", "summary", "recommendation")
	})
}

func TestAPIContractMutatingActionResultShape(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithWriteActionsEnabled(true),
		WithAuth(AuthConfig{
			Enabled: true,
			Tokens: []AuthToken{
				{Token: "operator-token", User: "operator", Role: "operator"},
			},
		}),
	)
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
			body:   `{"namespace":"default","name":"contract-pod","image":"nginx:latest"}`,
		},
		{
			name:   "restart pod",
			method: http.MethodPost,
			path:   "/api/pods/default/contract-pod/restart",
		},
		{
			name:   "delete pod",
			method: http.MethodDelete,
			path:   "/api/pods/default/contract-pod",
		},
		{
			name:   "cordon node",
			method: http.MethodPost,
			path:   "/api/nodes/node-1/cordon",
		},
		{
			name:   "apply yaml",
			method: http.MethodPut,
			path:   "/api/resources/deployments/default/payment-gateway/yaml",
			body:   `{"yaml":"apiVersion: apps/v1\nkind: Deployment"}`,
		},
		{
			name:   "scale resource",
			method: http.MethodPost,
			path:   "/api/resources/deployments/default/payment-gateway/scale",
			body:   `{"replicas":2}`,
		},
		{
			name:   "restart resource",
			method: http.MethodPost,
			path:   "/api/resources/deployments/default/payment-gateway/restart",
		},
		{
			name:   "rollback resource",
			method: http.MethodPost,
			path:   "/api/resources/deployments/default/payment-gateway/rollback",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer operator-token")
			if tc.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}
			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)
			if rr.Code != http.StatusOK {
				t.Fatalf("status code = %d, want 200", rr.Code)
			}

			var payload map[string]any
			if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			assertHasKeys(t, payload, "success", "message")
		})
	}
}

func TestAPIContractErrorShapeForAuthFailures(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithAuth(AuthConfig{
			Enabled: true,
			Tokens: []AuthToken{
				{Token: "viewer-token", User: "viewer", Role: "viewer"},
			},
		}),
		WithWriteActionsEnabled(true),
	)
	router := server.Router("")

	tests := []struct {
		name       string
		path       string
		authHeader string
		wantStatus int
	}{
		{
			name:       "missing token",
			path:       "/api/pods",
			authHeader: "",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "invalid token",
			path:       "/api/pods",
			authHeader: "Bearer invalid-token",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "insufficient role",
			path:       "/api/pods",
			authHeader: "Bearer viewer-token",
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, tc.path, strings.NewReader(`{"namespace":"default","name":"x","image":"nginx"}`))
			req.Header.Set("Content-Type", "application/json")
			if tc.authHeader != "" {
				req.Header.Set("Authorization", tc.authHeader)
			}
			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)

			if rr.Code != tc.wantStatus {
				t.Fatalf("status code = %d, want %d", rr.Code, tc.wantStatus)
			}

			var payload map[string]any
			if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			assertHasKeys(t, payload, "error")
			if _, ok := payload["success"]; ok {
				t.Fatalf("error payload must not include success key: %#v", payload)
			}
		})
	}
}

func assertHasKeys(t *testing.T, payload map[string]any, keys ...string) {
	t.Helper()
	for _, key := range keys {
		if _, ok := payload[key]; !ok {
			t.Fatalf("missing required key %q in payload: %#v", key, payload)
		}
	}
}
