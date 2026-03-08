package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"kubelens-backend/internal/model"
)

func TestRateLimiterBlocksExcessRequests(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithRateLimit(RateLimitConfig{
			Enabled:  true,
			Requests: 1,
			Window:   time.Minute,
		}),
	)
	router := server.Router("")

	first := httptest.NewRequest(http.MethodGet, "/api/pods", nil)
	first.RemoteAddr = "10.0.0.1:1234"
	firstResp := httptest.NewRecorder()
	router.ServeHTTP(firstResp, first)
	if firstResp.Code != http.StatusOK {
		t.Fatalf("first status = %d, want 200", firstResp.Code)
	}

	second := httptest.NewRequest(http.MethodGet, "/api/pods", nil)
	second.RemoteAddr = "10.0.0.1:7777"
	secondResp := httptest.NewRecorder()
	router.ServeHTTP(secondResp, second)
	if secondResp.Code != http.StatusTooManyRequests {
		t.Fatalf("second status = %d, want 429", secondResp.Code)
	}
}

func TestRateLimiterCanonicalizesHostPortForSameIP(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithRateLimit(RateLimitConfig{
			Enabled:  true,
			Requests: 1,
			Window:   time.Minute,
		}),
	)
	router := server.Router("")

	first := httptest.NewRequest(http.MethodGet, "/api/pods", nil)
	first.RemoteAddr = "10.0.0.9:1111"
	firstResp := httptest.NewRecorder()
	router.ServeHTTP(firstResp, first)
	if firstResp.Code != http.StatusOK {
		t.Fatalf("first status = %d, want 200", firstResp.Code)
	}

	second := httptest.NewRequest(http.MethodGet, "/api/pods", nil)
	second.RemoteAddr = "10.0.0.9:2222"
	secondResp := httptest.NewRecorder()
	router.ServeHTTP(secondResp, second)
	if secondResp.Code != http.StatusTooManyRequests {
		t.Fatalf("second status = %d, want 429", secondResp.Code)
	}
}

func TestErrorPayloadShapeConsistency(t *testing.T) {
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

	req := httptest.NewRequest(http.MethodPost, "/api/pods", strings.NewReader(`{"namespace":"default","name":"demo","image":"nginx:latest"}`))
	req.Header.Set("Authorization", "Bearer viewer-token")
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rr.Code)
	}

	var payload map[string]any
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}

	if len(payload) != 1 {
		t.Fatalf("payload keys = %d, want 1", len(payload))
	}
	value, ok := payload["error"].(string)
	if !ok || strings.TrimSpace(value) == "" {
		t.Fatalf("expected non-empty error field, got: %#v", payload)
	}
}

func TestMutationBlockedWhenWriteActionsDisabled(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithAuth(AuthConfig{
			Enabled: true,
			Tokens: []AuthToken{
				{Token: "operator-token", User: "operator", Role: "operator"},
			},
		}),
		WithWriteActionsEnabled(false),
	)
	router := server.Router("")

	req := httptest.NewRequest(http.MethodPost, "/api/pods", strings.NewReader(`{"namespace":"default","name":"demo","image":"nginx:latest"}`))
	req.Header.Set("Authorization", "Bearer operator-token")
	req.Header.Set("Content-Type", "application/json")

	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rr.Code)
	}
}

func TestRuntimeEndpoint(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithRuntimeStatus(model.RuntimeStatus{
			Mode:                "demo",
			Insecure:            true,
			AuthEnabled:         false,
			WriteActionsEnabled: false,
			PredictorHealthy:    true,
		}),
	)
	router := server.Router("")

	req := httptest.NewRequest(http.MethodGet, "/api/runtime", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}

	var payload model.RuntimeStatus
	if err := json.NewDecoder(rr.Body).Decode(&payload); err != nil {
		t.Fatalf("decode runtime payload: %v", err)
	}
	if payload.Mode != "demo" {
		t.Fatalf("mode = %s, want demo", payload.Mode)
	}
}
