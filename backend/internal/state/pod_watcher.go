package state

import (
	"strings"

	corev1 "k8s.io/api/core/v1"
)

func (c *ClusterCache) onPodAdd(obj any) {
	pod, ok := obj.(*corev1.Pod)
	if !ok || pod == nil {
		return
	}

	info := mapPodInfo(pod)
	key := podKey(info.Namespace, info.Name)

	c.mu.Lock()
	prev, existed := c.state.Pods[key]
	c.state.Pods[key] = info
	c.setLastUpdated()
	c.mu.Unlock()

	c.publishPodSignals(prev, info, existed)
}

func (c *ClusterCache) onPodUpdate(oldObj, newObj any) {
	pod, ok := newObj.(*corev1.Pod)
	if !ok || pod == nil {
		return
	}

	info := mapPodInfo(pod)
	key := podKey(info.Namespace, info.Name)

	c.mu.Lock()
	prev := c.state.Pods[key]
	c.state.Pods[key] = info
	c.setLastUpdated()
	c.mu.Unlock()

	c.publishPodSignals(prev, info, true)
}

func (c *ClusterCache) onPodDelete(obj any) {
	pod, ok := obj.(*corev1.Pod)
	if !ok || pod == nil {
		return
	}

	key := podKey(pod.Namespace, pod.Name)

	c.mu.Lock()
	delete(c.state.Pods, key)
	c.setLastUpdated()
	c.mu.Unlock()

	c.publish("pod_deleted", map[string]any{
		"namespace": pod.Namespace,
		"pod":       pod.Name,
	})
}

func (c *ClusterCache) publishPodSignals(prev PodInfo, current PodInfo, hadPrev bool) {
	c.publish("pod_update", map[string]any{
		"namespace": current.Namespace,
		"pod":       current.Name,
		"status":    current.Phase,
		"restarts":  current.Restarts,
	})

	if hadPrev && current.Restarts > prev.Restarts {
		c.publish("pod_restart", map[string]any{
			"namespace": current.Namespace,
			"pod":       current.Name,
			"restarts":  current.Restarts,
			"reason":    podLastReason(current),
		})
	}

	if hadPrev && !strings.EqualFold(prev.Phase, current.Phase) {
		switch strings.ToLower(current.Phase) {
		case "failed":
			c.publish("pod_failed", map[string]any{
				"namespace": current.Namespace,
				"pod":       current.Name,
				"reason":    podLastReason(current),
			})
		case "pending":
			c.publish("pod_pending", map[string]any{
				"namespace": current.Namespace,
				"pod":       current.Name,
				"reason":    podWaitingReason(current),
			})
		}
	}
}

func podKey(namespace, name string) string {
	if namespace == "" {
		return name
	}
	return namespace + "/" + name
}

func podLastReason(pod PodInfo) string {
	for _, container := range pod.Containers {
		if container.TerminatedReason != "" {
			return container.TerminatedReason
		}
	}
	return pod.StatusReason
}

func podWaitingReason(pod PodInfo) string {
	for _, container := range pod.Containers {
		if container.WaitingReason != "" {
			return container.WaitingReason
		}
	}
	return pod.StatusReason
}
