package diagnostics

import (
	"strings"
	"testing"

	"kubelens-backend/internal/model"
)

func TestBuildDiagnosticsCountsAndScore(t *testing.T) {
	pods := []model.PodSummary{
		{Name: "api-1", Namespace: "prod", Status: model.PodStatusRunning, Restarts: 0},
		{Name: "api-2", Namespace: "prod", Status: model.PodStatusPending, Restarts: 0},
		{Name: "worker-1", Namespace: "prod", Status: model.PodStatusFailed, Restarts: 4},
	}
	nodes := []model.NodeSummary{
		{Name: "node-1", Status: model.NodeStatusReady},
		{Name: "node-2", Status: model.NodeStatusNotReady},
	}

	result := BuildDiagnostics(pods, nodes)

	if result.CriticalIssues != 2 {
		t.Fatalf("expected 2 critical issues, got %d", result.CriticalIssues)
	}

	if result.WarningIssues != 2 {
		t.Fatalf("expected 2 warning issues, got %d", result.WarningIssues)
	}

	if result.HealthScore != 30 {
		t.Fatalf("expected health score 30, got %d", result.HealthScore)
	}
}

func TestDiagnosePodIssueDetectsConnectivity(t *testing.T) {
	pod := model.PodSummary{
		Name:      "payment-gateway",
		Namespace: "production",
		Status:    model.PodStatusFailed,
		Restarts:  5,
	}

	events := []model.K8sEvent{
		{Reason: "BackOff"},
	}

	logs := "ERROR database connection timeout while connecting to postgres"

	diag := DiagnosePodIssue(pod, events, logs)
	if diag.RootCause != "Dependency connectivity failure" {
		t.Fatalf("unexpected root cause: %s", diag.RootCause)
	}
}

func TestBuildPodDiagnosisMessageHasSections(t *testing.T) {
	pod := model.PodSummary{
		Name:      "api",
		Namespace: "default",
		Status:    model.PodStatusFailed,
		Restarts:  3,
		Age:       "10m",
	}

	message := BuildPodDiagnosisMessage(pod, PodDiagnosis{
		RootCause: "Container crash loop",
		Evidence:  []string{"restart policy exhausted"},
		Actions:   []string{"check startup command"},
	})

	required := []string{"Root Cause", "Evidence", "Recommended Fix"}
	for _, token := range required {
		if !strings.Contains(message, token) {
			t.Fatalf("expected %q in diagnosis message", token)
		}
	}
}
