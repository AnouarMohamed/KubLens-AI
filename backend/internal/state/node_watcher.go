package state

import (
	"strings"

	corev1 "k8s.io/api/core/v1"
)

func (c *ClusterCache) onNodeAdd(obj any) {
	node, ok := obj.(*corev1.Node)
	if !ok || node == nil {
		return
	}

	info := mapNodeInfo(node)

	c.mu.Lock()
	prev, existed := c.state.Nodes[info.Name]
	c.state.Nodes[info.Name] = info
	c.setLastUpdated()
	c.mu.Unlock()

	c.publishNodeSignals(prev, info, existed)
}

func (c *ClusterCache) onNodeUpdate(oldObj, newObj any) {
	node, ok := newObj.(*corev1.Node)
	if !ok || node == nil {
		return
	}

	info := mapNodeInfo(node)

	c.mu.Lock()
	prev := c.state.Nodes[info.Name]
	c.state.Nodes[info.Name] = info
	c.setLastUpdated()
	c.mu.Unlock()

	c.publishNodeSignals(prev, info, true)
}

func (c *ClusterCache) onNodeDelete(obj any) {
	node, ok := obj.(*corev1.Node)
	if !ok || node == nil {
		return
	}

	c.mu.Lock()
	delete(c.state.Nodes, node.Name)
	c.setLastUpdated()
	c.mu.Unlock()

	c.publish("node_deleted", map[string]any{
		"node": node.Name,
	})
}

func (c *ClusterCache) publishNodeSignals(prev NodeInfo, current NodeInfo, hadPrev bool) {
	c.publish("node_update", map[string]any{
		"node":   current.Name,
		"status": current.Status,
	})

	if hadPrev && !strings.EqualFold(prev.Status, current.Status) {
		if strings.EqualFold(current.Status, "NotReady") {
			c.publish("node_not_ready", map[string]any{
				"node":   current.Name,
				"reason": nodeConditionReason(current.Conditions, "Ready"),
			})
		}
	}

	pressureTypes := []string{"MemoryPressure", "DiskPressure", "PIDPressure"}
	for _, t := range pressureTypes {
		if nodeConditionTrue(current.Conditions, t) && (!hadPrev || !nodeConditionTrue(prev.Conditions, t)) {
			c.publish("node_pressure", map[string]any{
				"node":      current.Name,
				"condition": t,
			})
		}
	}
}

func nodeConditionTrue(conditions []ConditionInfo, condType string) bool {
	for _, condition := range conditions {
		if strings.EqualFold(condition.Type, condType) && strings.EqualFold(condition.Status, "True") {
			return true
		}
	}
	return false
}

func nodeConditionReason(conditions []ConditionInfo, condType string) string {
	for _, condition := range conditions {
		if strings.EqualFold(condition.Type, condType) {
			return condition.Reason
		}
	}
	return ""
}
