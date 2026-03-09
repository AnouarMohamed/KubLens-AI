package state

import (
	"strings"

	appsv1 "k8s.io/api/apps/v1"
)

func (c *ClusterCache) onDeploymentAdd(obj any) {
	deploy, ok := obj.(*appsv1.Deployment)
	if !ok || deploy == nil {
		return
	}

	info := mapDeploymentInfo(deploy)
	key := podKey(info.Namespace, info.Name)

	c.mu.Lock()
	prev, existed := c.state.Deployments[key]
	c.state.Deployments[key] = info
	c.setLastUpdated()
	c.mu.Unlock()

	c.publishDeploymentSignals(prev, info, existed)
}

func (c *ClusterCache) onDeploymentUpdate(oldObj, newObj any) {
	deploy, ok := newObj.(*appsv1.Deployment)
	if !ok || deploy == nil {
		return
	}

	info := mapDeploymentInfo(deploy)
	key := podKey(info.Namespace, info.Name)

	c.mu.Lock()
	prev := c.state.Deployments[key]
	c.state.Deployments[key] = info
	c.setLastUpdated()
	c.mu.Unlock()

	c.publishDeploymentSignals(prev, info, true)
}

func (c *ClusterCache) onDeploymentDelete(obj any) {
	deploy, ok := obj.(*appsv1.Deployment)
	if !ok || deploy == nil {
		return
	}

	key := podKey(deploy.Namespace, deploy.Name)

	c.mu.Lock()
	delete(c.state.Deployments, key)
	c.setLastUpdated()
	c.mu.Unlock()

	c.publish("deployment_deleted", map[string]any{
		"namespace":  deploy.Namespace,
		"deployment": deploy.Name,
	})
}

func (c *ClusterCache) publishDeploymentSignals(prev DeploymentInfo, current DeploymentInfo, hadPrev bool) {
	c.publish("deployment_update", map[string]any{
		"namespace":  current.Namespace,
		"deployment": current.Name,
		"ready":      current.ReadyReplicas,
		"desired":    current.DesiredReplicas,
	})

	if current.DesiredReplicas > 0 && current.ReadyReplicas < current.DesiredReplicas {
		if !hadPrev || prev.ReadyReplicas >= prev.DesiredReplicas {
			c.publish("deployment_unavailable", map[string]any{
				"namespace":  current.Namespace,
				"deployment": current.Name,
				"ready":      current.ReadyReplicas,
				"desired":    current.DesiredReplicas,
				"reason":     firstNonEmptyConditionReason(current.Conditions),
			})
		}
	}
}

func firstNonEmptyConditionReason(conditions []ConditionInfo) string {
	for _, condition := range conditions {
		if strings.TrimSpace(condition.Reason) != "" {
			return condition.Reason
		}
	}
	return ""
}
