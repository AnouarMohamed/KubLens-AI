package remediation

import (
	"testing"

	"kubelens-backend/internal/model"
)

func TestProposeFromDiagnostics(t *testing.T) {
	diag := model.DiagnosticsResult{
		Issues: []model.DiagnosticIssue{
			{
				Severity:       model.SeverityCritical,
				Resource:       "production/payment-gateway-7f8d-abc12",
				Message:        "CrashLoopBackOff",
				Recommendation: "Inspect logs",
			},
			{
				Severity:       model.SeverityCritical,
				Resource:       "production/pending-issue",
				Message:        "Pending due to ResourceQuota",
				Recommendation: "Increase quota",
			},
		},
	}
	pods := []model.PodSummary{
		{Name: "payment-gateway-7f8d-abc12", Namespace: "production", Restarts: 4},
		{Name: "payment-gateway-7f8d-def34", Namespace: "production", Restarts: 3},
	}
	nodes := []model.NodeSummary{
		{Name: "node-1", Status: model.NodeStatusNotReady},
	}

	proposals := ProposeFromDiagnostics(diag, pods, nodes)
	if len(proposals) < 3 {
		t.Fatalf("proposal count = %d, want >= 3", len(proposals))
	}

	var hasRestart bool
	var hasCordon bool
	var hasRollback bool
	for _, proposal := range proposals {
		switch proposal.Kind {
		case model.RemediationKindRestartPod:
			hasRestart = true
		case model.RemediationKindCordonNode:
			hasCordon = true
		case model.RemediationKindRollbackDeployment:
			hasRollback = true
		}
		if proposal.Status != "proposed" {
			t.Fatalf("proposal status = %q, want proposed", proposal.Status)
		}
	}

	if !hasRestart || !hasCordon || !hasRollback {
		t.Fatalf("expected restart=%t cordon=%t rollback=%t", hasRestart, hasCordon, hasRollback)
	}
}
