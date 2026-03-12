package alerts

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"kubelens-backend/internal/model"
)

func TestDispatchParallelSuccess(t *testing.T) {
	t.Parallel()

	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)

	svc := New(Config{
		AlertmanagerURL:     server.URL,
		SlackWebhookURL:     server.URL,
		PagerDutyEventsURL:  server.URL,
		PagerDutyRoutingKey: "pd-routing-key",
		Timeout:             2 * time.Second,
	})

	response := svc.Dispatch(context.Background(), model.AlertDispatchRequest{
		Title:    "test alert",
		Message:  "test message",
		Severity: "warning",
		Source:   "test-suite",
	})

	if !response.Success {
		t.Fatalf("expected dispatch success, got failure: %#v", response.Results)
	}
	if got := len(response.Results); got != 3 {
		t.Fatalf("expected 3 channel results, got %d", got)
	}
	if got := calls.Load(); got != 3 {
		t.Fatalf("expected 3 webhook calls, got %d", got)
	}
}

func TestDispatchPagerDutyMissingRoutingKey(t *testing.T) {
	t.Parallel()

	svc := New(Config{
		PagerDutyEventsURL: "https://example.invalid/pagerduty",
		Timeout:            2 * time.Second,
	})

	response := svc.Dispatch(context.Background(), model.AlertDispatchRequest{
		Title:   "test alert",
		Message: "test message",
	})

	if response.Success {
		t.Fatalf("expected failure when pagerduty routing key is missing")
	}
	if len(response.Results) != 1 {
		t.Fatalf("expected exactly one result, got %d", len(response.Results))
	}
	if response.Results[0].Channel != "pagerduty" {
		t.Fatalf("expected pagerduty channel result, got %s", response.Results[0].Channel)
	}
	if response.Results[0].Success {
		t.Fatalf("expected pagerduty dispatch to fail without routing key")
	}
}

func TestPostJSONIncludesResponseBodyOnFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "invalid payload"})
	}))
	t.Cleanup(server.Close)

	svc := New(Config{
		SlackWebhookURL: server.URL,
		Timeout:         2 * time.Second,
	})

	response := svc.Dispatch(context.Background(), model.AlertDispatchRequest{
		Title:   "test",
		Message: "test",
	})

	if response.Success {
		t.Fatalf("expected failure from 400 response")
	}
	if len(response.Results) != 1 {
		t.Fatalf("expected one result, got %d", len(response.Results))
	}
	if response.Results[0].Error == "" {
		t.Fatalf("expected non-empty error message")
	}
	if want := "invalid payload"; !strings.Contains(response.Results[0].Error, want) {
		t.Fatalf("expected error to include %q, got %q", want, response.Results[0].Error)
	}
}
