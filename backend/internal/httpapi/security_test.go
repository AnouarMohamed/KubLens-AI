package httpapi

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
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
		WithTerminalPolicy(TerminalPolicy{
			Enabled:         true,
			AllowedPrefixes: []string{"kubectl"},
		}),
	)
	router := server.Router("")

	disallowed := httptest.NewRequest(http.MethodPost, "/api/terminal/exec", strings.NewReader(`{"command":"echo hello"}`))
	disallowed.Header.Set("Content-Type", "application/json")
	disallowedResp := httptest.NewRecorder()
	router.ServeHTTP(disallowedResp, disallowed)
	if disallowedResp.Code != http.StatusBadRequest {
		t.Fatalf("disallowed status = %d, want 400", disallowedResp.Code)
	}
}
