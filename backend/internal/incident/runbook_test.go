package incident

import (
	"strings"
	"testing"

	"kubelens-backend/internal/model"
)

func TestBuildRunbookOrderingAndFinalVerification(t *testing.T) {
	diag := model.DiagnosticsResult{
		Issues: []model.DiagnosticIssue{
			{
				Severity:       model.SeverityCritical,
				Resource:       "production/payment-gateway-7f8d-abc12",
				Message:        "Critical pod crash",
				Recommendation: "Inspect logs",
			},
			{
				Severity:       model.SeverityWarning,
				Resource:       "production/payment-gateway-7f8d-abc12",
				Message:        "Restart flapping",
				Recommendation: "Roll deployment",
			},
			{
				Severity:       model.SeverityCritical,
				Resource:       "node-1",
				Message:        "Node not ready",
				Recommendation: "Inspect node",
			},
		},
	}
	pods := []model.PodSummary{
		{Name: "payment-gateway-7f8d-abc12", Namespace: "production", Status: model.PodStatusRunning},
		{Name: "checkout-api-7446cc8cb6-v5x9h", Namespace: "production", Status: model.PodStatusPending},
	}

	steps := BuildRunbook(diag, pods, nil)
	if len(steps) < 4 {
		t.Fatalf("runbook step count = %d, want >= 4", len(steps))
	}
	if steps[0].ID != "step-1" {
		t.Fatalf("first step id = %s, want step-1", steps[0].ID)
	}
	if !strings.Contains(steps[0].Command, "kubectl describe pod payment-gateway-7f8d-abc12") {
		t.Fatalf("unexpected first command: %s", steps[0].Command)
	}

	foundRestart := false
	foundNode := false
	foundPending := false
	for _, step := range steps {
		if strings.Contains(step.Command, "rollout restart deployment/payment-gateway") {
			foundRestart = true
		}
		if strings.Contains(step.Command, "kubectl describe node node-1") {
			foundNode = true
		}
		if strings.Contains(step.Command, "kubectl describe pod checkout-api-7446cc8cb6-v5x9h") {
			foundPending = true
		}
	}
	if !foundRestart || !foundNode || !foundPending {
		t.Fatalf("expected restart=%t node=%t pending=%t", foundRestart, foundNode, foundPending)
	}

	last := steps[len(steps)-1]
	if last.Title != "Verify cluster health" {
		t.Fatalf("final step title = %q, want verify", last.Title)
	}
	if !last.Mandatory {
		t.Fatal("final step should be mandatory")
	}
}

func TestInferDeploymentName(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "hashed pod", in: "payment-gateway-7f8d9a0b6c-abc12", want: "payment-gateway"},
		{name: "short name", in: "api", want: ""},
		{name: "two segments", in: "payment-gateway", want: ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := inferDeploymentName(tc.in)
			if got != tc.want {
				t.Fatalf("inferDeploymentName(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
