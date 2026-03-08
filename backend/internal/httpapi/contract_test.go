package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
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
				"writeActionsEnabled", "terminalEnabled", "predictorEnabled",
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

func assertHasKeys(t *testing.T, payload map[string]any, keys ...string) {
	t.Helper()
	for _, key := range keys {
		if _, ok := payload[key]; !ok {
			t.Fatalf("missing required key %q in payload: %#v", key, payload)
		}
	}
}
