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

func TestTerminalPolicyAllowlist(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithWriteActionsEnabled(true),
		WithAuth(AuthConfig{
			Enabled: true,
			Tokens: []AuthToken{
				{Token: "admin-token", User: "admin", Role: "admin"},
			},
		}),
		WithTerminalPolicy(TerminalPolicy{
			Enabled:         true,
			AllowedPrefixes: []string{"kubectl"},
		}),
	)
	router := server.Router("")

	disallowed := httptest.NewRequest(http.MethodPost, "/api/terminal/exec", strings.NewReader(`{"command":"echo hello"}`))
	disallowed.Header.Set("Content-Type", "application/json")
	disallowed.Header.Set("Authorization", "Bearer admin-token")
	disallowedResp := httptest.NewRecorder()
	router.ServeHTTP(disallowedResp, disallowed)
	if disallowedResp.Code != http.StatusBadRequest {
		t.Fatalf("disallowed status = %d, want 400", disallowedResp.Code)
	}
}

func TestTerminalPolicyBlocksShellOperatorBypass(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithWriteActionsEnabled(true),
		WithAuth(AuthConfig{
			Enabled: true,
			Tokens: []AuthToken{
				{Token: "admin-token", User: "admin", Role: "admin"},
			},
		}),
		WithTerminalPolicy(TerminalPolicy{
			Enabled:            true,
			AllowedPrefixes:    []string{"kubectl"},
			KubectlAllowedVerb: []string{"get", "logs"},
		}),
	)
	router := server.Router("")

	req := httptest.NewRequest(http.MethodPost, "/api/terminal/exec", strings.NewReader(`{"command":"kubectl get pods -A && kubectl delete pod x"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer admin-token")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
	}
}

func TestTerminalPolicyBlocksDeniedPrefixWithLeadingWhitespace(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithWriteActionsEnabled(true),
		WithAuth(AuthConfig{
			Enabled: true,
			Tokens: []AuthToken{
				{Token: "admin-token", User: "admin", Role: "admin"},
			},
		}),
		WithTerminalPolicy(TerminalPolicy{
			Enabled:         true,
			AllowedPrefixes: []string{"kubectl"},
			DeniedPrefixes:  []string{"kubectl delete"},
		}),
	)
	router := server.Router("")

	req := httptest.NewRequest(http.MethodPost, "/api/terminal/exec", strings.NewReader(`{"command":"   kubectl delete pod demo"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer admin-token")
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rr.Code)
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

func TestTerminalBlockedWhenWriteActionsDisabled(t *testing.T) {
	logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
	server := newServer(
		testClusterReader{},
		nil,
		logger,
		WithAuth(AuthConfig{
			Enabled: true,
			Tokens: []AuthToken{
				{Token: "admin-token", User: "admin", Role: "admin"},
			},
		}),
		WithWriteActionsEnabled(false),
		WithTerminalPolicy(TerminalPolicy{
			Enabled:         true,
			AllowedPrefixes: []string{"kubectl"},
		}),
	)
	router := server.Router("")

	req := httptest.NewRequest(http.MethodPost, "/api/terminal/exec", strings.NewReader(`{"command":"kubectl get pods -A"}`))
	req.Header.Set("Authorization", "Bearer admin-token")
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
			TerminalEnabled:     false,
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
