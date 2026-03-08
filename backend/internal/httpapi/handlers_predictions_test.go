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

func TestConfidenceFromEvidenceRewardsSignalQuality(t *testing.T) {
	lowEvidence := confidenceFromEvidence(evidenceProfile{
		strongStatus:      false,
		signalCount:       1,
		metricKnown:       0,
		metricSignalCount: 0,
		warningMatches:    0,
		restartSignal:     false,
	})

	highEvidence := confidenceFromEvidence(evidenceProfile{
		strongStatus:      true,
		signalCount:       4,
		metricKnown:       2,
		metricSignalCount: 2,
		warningMatches:    3,
		restartSignal:     true,
	})

	if highEvidence <= lowEvidence {
		t.Fatalf("confidence should increase with richer evidence: low=%d high=%d", lowEvidence, highEvidence)
	}
}

func TestCountResourceWarningEventsMatchesResourceText(t *testing.T) {
	events := []model.K8sEvent{
		{
			Type:    "Warning",
			Reason:  "BackOff",
			Message: "pod payment-gateway in namespace production restarted repeatedly",
			Count:   3,
		},
		{
			Type:    "Normal",
			Reason:  "Scheduled",
			Message: "pod auth-service assigned",
			Count:   1,
		},
		{
			Type:    "Warning",
			Reason:  "Failed",
			Message: "node node-worker-3 kubelet is not ready",
			Count:   2,
		},
	}

	podMatches := countResourceWarningEvents(events, "payment-gateway", "production")
	nodeMatches := countResourceWarningEvents(events, "node-worker-3", "")

	if podMatches != 3 {
		t.Fatalf("pod warning matches = %d, want 3", podMatches)
	}
	if nodeMatches != 2 {
		t.Fatalf("node warning matches = %d, want 2", nodeMatches)
	}
}
