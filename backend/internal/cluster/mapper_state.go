package cluster

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"kubelens-backend/internal/model"
	"kubelens-backend/internal/state"
)

func podsFromState(snapshot state.ClusterState) []model.PodSummary {
	out := make([]model.PodSummary, 0, len(snapshot.Pods))
	for _, pod := range snapshot.Pods {
		out = append(out, mapPodSummaryFromState(pod))
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Namespace == out[j].Namespace {
			return out[i].Name < out[j].Name
		}
		return out[i].Namespace < out[j].Namespace
	})
	return out
}

func nodesFromState(snapshot state.ClusterState) []model.NodeSummary {
	out := make([]model.NodeSummary, 0, len(snapshot.Nodes))
	for _, node := range snapshot.Nodes {
		out = append(out, mapNodeSummaryFromState(node))
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].Name < out[j].Name
	})
	return out
}

func namespacesFromState(snapshot state.ClusterState) []string {
	seen := map[string]struct{}{}
	for _, pod := range snapshot.Pods {
		if pod.Namespace == "" {
			continue
		}
		seen[pod.Namespace] = struct{}{}
	}
	out := make([]string, 0, len(seen))
	for name := range seen {
		out = append(out, name)
	}
	sort.Strings(out)
	return out
}

func eventsFromState(snapshot state.ClusterState) []model.K8sEvent {
	out := make([]model.K8sEvent, 0, len(snapshot.Events))
	for _, event := range snapshot.Events {
		out = append(out, mapK8sEventFromState(event))
	}
	return out
}

func deploymentRecordsFromState(snapshot state.ClusterState) []model.ResourceRecord {
	out := make([]model.ResourceRecord, 0, len(snapshot.Deployments))
	for _, deploy := range snapshot.Deployments {
		desired := deploy.DesiredReplicas
		if desired <= 0 {
			desired = 1
		}
		out = append(out, model.ResourceRecord{
			ID:        deploy.UID,
			Name:      deploy.Name,
			Namespace: deploy.Namespace,
			Status:    fmt.Sprintf("%d/%d Ready", deploy.ReadyReplicas, desired),
			Age:       formatAge(deploy.CreatedAt),
			Summary:   deploy.Strategy,
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Namespace == out[j].Namespace {
			return out[i].Name < out[j].Name
		}
		return out[i].Namespace < out[j].Namespace
	})
	return out
}

func podEventsFromState(snapshot state.ClusterState, namespace, name string) []model.K8sEvent {
	out := make([]model.K8sEvent, 0, 10)
	for _, event := range snapshot.Events {
		if event.Namespace == namespace && event.InvolvedObjectName == name {
			out = append(out, mapK8sEventFromState(event))
		}
	}
	return out
}

func podDetailFromState(snapshot state.ClusterState, namespace, name string) (model.PodDetail, bool) {
	key := namespace + "/" + name
	pod, ok := snapshot.Pods[key]
	if !ok {
		return model.PodDetail{}, false
	}

	detail := model.PodDetail{
		PodSummary: mapPodSummaryFromState(pod),
		NodeName:   pod.NodeName,
		Containers: make([]model.ContainerSpec, 0, len(pod.Containers)),
		Volumes:    []model.NamedVolume{},
	}

	for _, container := range pod.Containers {
		detail.Containers = append(detail.Containers, model.ContainerSpec{
			Name:  container.Name,
			Image: container.Image,
			Resources: &model.ContainerResources{
				Requests: &model.ResourcePairs{
					CPU:    formatMilliCPU(container.ResourceRequests.CPUMilli),
					Memory: formatMemoryBytes(container.ResourceRequests.MemoryBytes),
				},
				Limits: &model.ResourcePairs{
					CPU:    formatMilliCPU(container.ResourceLimits.CPUMilli),
					Memory: formatMemoryBytes(container.ResourceLimits.MemoryBytes),
				},
			},
		})
	}

	return detail, true
}

func nodeDetailFromState(snapshot state.ClusterState, name string) (model.NodeDetail, bool) {
	node, ok := snapshot.Nodes[name]
	if !ok {
		return model.NodeDetail{}, false
	}

	detail := model.NodeDetail{
		NodeSummary: mapNodeSummaryFromState(node),
		Capacity: model.ResourceCapacity{
			CPU:    formatMilliCPU(node.Capacity.CPUMilli),
			Memory: formatMemoryBytes(node.Capacity.MemoryBytes),
			Pods:   "",
		},
		Allocatable: model.ResourceCapacity{
			CPU:    formatMilliCPU(node.Allocatable.CPUMilli),
			Memory: formatMemoryBytes(node.Allocatable.MemoryBytes),
			Pods:   "",
		},
		Conditions: make([]model.NodeCondition, 0, len(node.Conditions)),
		Addresses:  []model.NodeAddress{},
	}

	for _, condition := range node.Conditions {
		detail.Conditions = append(detail.Conditions, model.NodeCondition{
			Type:               condition.Type,
			Status:             condition.Status,
			LastTransitionTime: formatTime(condition.LastTransitionTime),
			Reason:             condition.Reason,
			Message:            condition.Message,
		})
	}
	return detail, true
}

func mapPodSummaryFromState(pod state.PodInfo) model.PodSummary {
	status := mapPodStatusFromState(pod.Phase)
	return model.PodSummary{
		ID:        pod.UID,
		Name:      pod.Name,
		Namespace: pod.Namespace,
		NodeName:  pod.NodeName,
		Status:    status,
		CPU:       formatMilliCPU(pod.Usage.CPUMilli),
		Memory:    formatMemoryBytes(pod.Usage.MemoryBytes),
		Age:       formatAge(pod.StartTime),
		Restarts:  pod.Restarts,
	}
}

func mapNodeSummaryFromState(node state.NodeInfo) model.NodeSummary {
	cpuUsage := formatUsagePercent(node.Usage.CPUMilli, node.Allocatable.CPUMilli)
	memUsage := formatUsagePercent(node.Usage.MemoryBytes, node.Allocatable.MemoryBytes)

	roles := strings.Join(node.Roles, ",")
	if roles == "" {
		roles = "worker"
	}

	return model.NodeSummary{
		Name:          node.Name,
		Status:        mapNodeStatusFromState(node.Status),
		Roles:         roles,
		Unschedulable: node.Unschedulable,
		Age:           formatAge(node.CreatedAt),
		Version:       node.Version,
		CPUUsage:      cpuUsage,
		MemUsage:      memUsage,
		CPUHistory:    mapCPUHistory(node),
	}
}

func mapCPUHistory(node state.NodeInfo) []model.CPUPoint {
	if len(node.UsageHistory) == 0 || node.Allocatable.CPUMilli <= 0 {
		return nil
	}

	points := make([]model.CPUPoint, 0, len(node.UsageHistory))
	for _, entry := range node.UsageHistory {
		percent := int((float64(entry.Usage.CPUMilli) / float64(node.Allocatable.CPUMilli)) * 100)
		if percent < 0 {
			percent = 0
		}
		if percent > 100 {
			percent = 100
		}
		points = append(points, model.CPUPoint{
			Time:  entry.Timestamp.Format("15:04:05"),
			Value: percent,
		})
	}
	return points
}

func mapK8sEventFromState(event state.EventInfo) model.K8sEvent {
	lastSeen := event.LastTimestamp
	if lastSeen.IsZero() {
		lastSeen = event.FirstTimestamp
	}

	return model.K8sEvent{
		Type:          event.Type,
		Reason:        event.Reason,
		Age:           formatAge(lastSeen),
		From:          event.Source,
		Message:       event.Message,
		Namespace:     event.Namespace,
		Resource:      event.InvolvedObjectName,
		ResourceKind:  event.InvolvedObjectKind,
		Count:         event.Count,
		LastTimestamp: formatRFC3339(lastSeen),
	}
}

func mapPodStatusFromState(phase string) model.PodStatus {
	switch strings.ToLower(strings.TrimSpace(phase)) {
	case "running":
		return model.PodStatusRunning
	case "pending":
		return model.PodStatusPending
	case "failed":
		return model.PodStatusFailed
	case "succeeded":
		return model.PodStatusSucceeded
	default:
		return model.PodStatusUnknown
	}
}

func mapNodeStatusFromState(status string) model.NodeStatus {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "ready":
		return model.NodeStatusReady
	case "notready":
		return model.NodeStatusNotReady
	default:
		return model.NodeStatusUnknown
	}
}

func formatTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Local().Format("2006-01-02 15:04:05")
}
