package remediation

import (
	"context"
	"fmt"
	"strings"

	"kubelens-backend/internal/model"
)

type ClusterWriter interface {
	RestartPod(ctx context.Context, namespace, name string) (model.ActionResult, error)
	CordonNode(ctx context.Context, name string) (model.ActionResult, error)
	RollbackResource(ctx context.Context, kind, namespace, name string) (model.ActionResult, error)
}

func Execute(ctx context.Context, proposal model.RemediationProposal, cluster ClusterWriter) (string, error) {
	if cluster == nil {
		return "", fmt.Errorf("cluster writer is not configured")
	}

	resource := strings.TrimSpace(proposal.Resource)
	namespace := strings.TrimSpace(proposal.Namespace)
	if resource == "" {
		return "", fmt.Errorf("proposal resource is required")
	}

	switch proposal.Kind {
	case model.RemediationKindRestartPod:
		if namespace == "" {
			return "", fmt.Errorf("restart proposal requires namespace")
		}
		result, err := cluster.RestartPod(ctx, namespace, resource)
		if err != nil {
			return "", err
		}
		if strings.TrimSpace(result.Message) != "" {
			return result.Message, nil
		}
		return fmt.Sprintf("Restart triggered for pod %s/%s", namespace, resource), nil
	case model.RemediationKindCordonNode:
		result, err := cluster.CordonNode(ctx, resource)
		if err != nil {
			return "", err
		}
		if strings.TrimSpace(result.Message) != "" {
			return result.Message, nil
		}
		return fmt.Sprintf("Node %s cordoned", resource), nil
	case model.RemediationKindRollbackDeployment:
		if namespace == "" {
			return "", fmt.Errorf("rollback proposal requires namespace")
		}
		result, err := cluster.RollbackResource(ctx, "deployments", namespace, resource)
		if err != nil {
			return "", err
		}
		if strings.TrimSpace(result.Message) != "" {
			return result.Message, nil
		}
		return fmt.Sprintf("Rolled back deployment %s/%s", namespace, resource), nil
	default:
		return "", fmt.Errorf("unsupported remediation kind: %s", proposal.Kind)
	}
}
