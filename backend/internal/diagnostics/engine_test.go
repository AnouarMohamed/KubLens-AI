package diagnostics

import (
	"fmt"
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

func TestBuildDiagnosticsHealthyClusterProducesInfoIssue(t *testing.T) {
	pods := []model.PodSummary{
		{Name: "api-1", Namespace: "prod", Status: model.PodStatusRunning, Restarts: 0},
	}
	nodes := []model.NodeSummary{
		{Name: "node-1", Status: model.NodeStatusReady},
	}

	result := BuildDiagnostics(pods, nodes)
	if result.CriticalIssues != 0 {
		t.Fatalf("expected no critical issues, got %d", result.CriticalIssues)
	}
	if result.WarningIssues != 0 {
		t.Fatalf("expected no warning issues, got %d", result.WarningIssues)
	}
	if len(result.Issues) != 1 || result.Issues[0].Severity != model.SeverityInfo {
		t.Fatalf("expected a single info issue, got %+v", result.Issues)
	}
}

func TestBuildDiagnosticsClampHealthScoreAtZero(t *testing.T) {
	pods := make([]model.PodSummary, 0, 12)
	for i := 0; i < 12; i++ {
		pods = append(pods, model.PodSummary{
			Name:      fmt.Sprintf("failed-%d", i),
			Namespace: "prod",
			Status:    model.PodStatusFailed,
			Restarts:  8,
		})
	}
	result := BuildDiagnostics(pods, []model.NodeSummary{{Name: "node-1", Status: model.NodeStatusNotReady}})
	if result.HealthScore != 0 {
		t.Fatalf("expected clamped health score 0, got %d", result.HealthScore)
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

func TestDiagnosePodIssueDetectsSchedulingFailure(t *testing.T) {
	pod := model.PodSummary{Name: "api", Namespace: "default", Status: model.PodStatusPending}
	events := []model.K8sEvent{{Reason: "FailedScheduling"}}

	diag := DiagnosePodIssue(pod, events, "")
	if diag.RootCause != "Scheduling failure" {
		t.Fatalf("unexpected root cause: %s", diag.RootCause)
	}
}

func TestDiagnosePodIssueDetectsOOM(t *testing.T) {
	pod := model.PodSummary{Name: "api", Namespace: "default", Status: model.PodStatusFailed, Restarts: 4}
	events := []model.K8sEvent{{Reason: "OOMKilled"}}

	diag := DiagnosePodIssue(pod, events, "process exited with OOMKilled")
	if diag.RootCause != "Memory pressure / OOM kill" {
		t.Fatalf("unexpected root cause: %s", diag.RootCause)
	}
}

func TestDiagnosePodIssueDetectsImagePull(t *testing.T) {
	pod := model.PodSummary{Name: "api", Namespace: "default", Status: model.PodStatusPending}
	events := []model.K8sEvent{{Reason: "ErrImagePull"}}

	diag := DiagnosePodIssue(pod, events, "")
	if diag.RootCause != "Image pull failure" {
		t.Fatalf("unexpected root cause: %s", diag.RootCause)
	}
}

func TestDiagnosePodIssueDetectsCrashLoop(t *testing.T) {
	pod := model.PodSummary{Name: "api", Namespace: "default", Status: model.PodStatusFailed, Restarts: 5}
	events := []model.K8sEvent{{Reason: "BackOff"}}

	diag := DiagnosePodIssue(pod, events, "panic at startup")
	if diag.RootCause != "Container crash loop" {
		t.Fatalf("unexpected root cause: %s", diag.RootCause)
	}
}

func TestDiagnosePodIssuePendingFallback(t *testing.T) {
	pod := model.PodSummary{Name: "api", Namespace: "default", Status: model.PodStatusPending}
	diag := DiagnosePodIssue(pod, nil, "")
	if diag.RootCause != "Pending workload" {
		t.Fatalf("unexpected root cause: %s", diag.RootCause)
	}
}

func TestDiagnosePodIssueNoCriticalSignature(t *testing.T) {
	pod := model.PodSummary{Name: "api", Namespace: "default", Status: model.PodStatusRunning}
	diag := DiagnosePodIssue(pod, nil, "all good")
	if diag.RootCause != "No critical fault signature detected" {
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
