package remediation

import (
	"context"
	"errors"
	"testing"

	"kubelens-backend/internal/model"
)

type testClusterWriter struct {
	restartCalled  bool
	cordonCalled   bool
	rollbackCalled bool
	err            error
}

func (t *testClusterWriter) RestartPod(context.Context, string, string) (model.ActionResult, error) {
	t.restartCalled = true
	if t.err != nil {
		return model.ActionResult{}, t.err
	}
	return model.ActionResult{Success: true, Message: "restarted"}, nil
}

func (t *testClusterWriter) CordonNode(context.Context, string) (model.ActionResult, error) {
	t.cordonCalled = true
	if t.err != nil {
		return model.ActionResult{}, t.err
	}
	return model.ActionResult{Success: true, Message: "cordoned"}, nil
}

func (t *testClusterWriter) RollbackResource(context.Context, string, string, string) (model.ActionResult, error) {
	t.rollbackCalled = true
	if t.err != nil {
		return model.ActionResult{}, t.err
	}
	return model.ActionResult{Success: true, Message: "rolled back"}, nil
}

func TestExecuteDispatchesByKind(t *testing.T) {
	tests := []struct {
		name     string
		proposal model.RemediationProposal
		assertFn func(*testing.T, *testClusterWriter)
	}{
		{
			name: "restart pod",
			proposal: model.RemediationProposal{
				Kind:      model.RemediationKindRestartPod,
				Namespace: "production",
				Resource:  "payment-gateway",
			},
			assertFn: func(t *testing.T, writer *testClusterWriter) {
				if !writer.restartCalled {
					t.Fatal("expected restart call")
				}
			},
		},
		{
			name: "cordon node",
			proposal: model.RemediationProposal{
				Kind:     model.RemediationKindCordonNode,
				Resource: "node-1",
			},
			assertFn: func(t *testing.T, writer *testClusterWriter) {
				if !writer.cordonCalled {
					t.Fatal("expected cordon call")
				}
			},
		},
		{
			name: "rollback deployment",
			proposal: model.RemediationProposal{
				Kind:      model.RemediationKindRollbackDeployment,
				Namespace: "production",
				Resource:  "payment-gateway",
			},
			assertFn: func(t *testing.T, writer *testClusterWriter) {
				if !writer.rollbackCalled {
					t.Fatal("expected rollback call")
				}
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			writer := &testClusterWriter{}
			if _, err := Execute(context.Background(), tc.proposal, writer); err != nil {
				t.Fatalf("Execute() error = %v", err)
			}
			tc.assertFn(t, writer)
		})
	}
}

func TestExecutePropagatesWriterError(t *testing.T) {
	writer := &testClusterWriter{err: errors.New("cluster failure")}
	_, err := Execute(context.Background(), model.RemediationProposal{
		Kind:      model.RemediationKindRestartPod,
		Namespace: "production",
		Resource:  "payment-gateway",
	}, writer)
	if err == nil {
		t.Fatal("expected error")
	}
}
