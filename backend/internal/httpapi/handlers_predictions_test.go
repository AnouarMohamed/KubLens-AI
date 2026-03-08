package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"kubelens-backend/internal/model"
)

func TestPredictorClientIncludesSharedSecretHeader(t *testing.T) {
	var observed string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		observed = r.Header.Get("X-Predictor-Secret")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(model.PredictionsResult{
			Source:      "predictor-test",
			GeneratedAt: "2026-03-08T00:00:00Z",
		})
	}))
	defer server.Close()

	client := newPredictorClient(server.URL, time.Second, "shared-secret")
	_, err := client.Predict(context.Background(), predictorRequest{})
	if err != nil {
		t.Fatalf("predictor request failed: %v", err)
	}
	if observed != "shared-secret" {
		t.Fatalf("header value = %q, want %q", observed, "shared-secret")
	}
}
