package cluster

import (
	"context"
	"fmt"

	"kubelens-backend/internal/model"
)

func (s *Service) listRealPodResources(ctx context.Context) []model.ResourceRecord {
	pods, _ := s.Snapshot(ctx)
	items := make([]model.ResourceRecord, 0, len(pods))
	for _, pod := range pods {
		items = append(items, model.ResourceRecord{
			ID:        pod.ID,
			Name:      pod.Name,
			Namespace: pod.Namespace,
			Status:    string(pod.Status),
			Age:       pod.Age,
			Summary:   fmt.Sprintf("CPU %s, Memory %s, Restarts %d", pod.CPU, pod.Memory, pod.Restarts),
		})
	}
	return items
}

func (s *Service) listRealNodeResources(ctx context.Context) []model.ResourceRecord {
	_, nodes := s.Snapshot(ctx)
	return nodeResourceRecords(nodes)
}

func (s *Service) listRealEventResources(ctx context.Context) []model.ResourceRecord {
	return eventResourceRecords(s.ListClusterEvents(ctx))
}

func (s *Service) listRealMetricsResources(ctx context.Context) []model.ResourceRecord {
	pods, nodes := s.Snapshot(ctx)
	return metricResourceRecords(pods, nodes)
}

func nodeResourceRecords(nodes []model.NodeSummary) []model.ResourceRecord {
	items := make([]model.ResourceRecord, 0, len(nodes))
	for _, node := range nodes {
		items = append(items, model.ResourceRecord{
			ID:      node.Name,
			Name:    node.Name,
			Status:  string(node.Status),
			Age:     node.Age,
			Summary: fmt.Sprintf("CPU %s, Memory %s", node.CPUUsage, node.MemUsage),
		})
	}
	return items
}

func eventResourceRecords(events []model.K8sEvent) []model.ResourceRecord {
	items := make([]model.ResourceRecord, 0, len(events))
	for i, event := range events {
		items = append(items, model.ResourceRecord{
			ID:      fmt.Sprintf("event-%d", i),
			Name:    event.Reason,
			Status:  event.Type,
			Age:     event.Age,
			Summary: event.Message,
		})
	}
	return items
}

func metricResourceRecords(pods []model.PodSummary, nodes []model.NodeSummary) []model.ResourceRecord {
	items := make([]model.ResourceRecord, 0, len(nodes)+len(pods))
	for _, node := range nodes {
		items = append(items, model.ResourceRecord{
			ID:      "node-" + node.Name,
			Name:    node.Name,
			Status:  "Node",
			Age:     node.Age,
			Summary: fmt.Sprintf("CPU %s, Memory %s", node.CPUUsage, node.MemUsage),
		})
	}
	for _, pod := range pods {
		items = append(items, model.ResourceRecord{
			ID:        "pod-" + pod.ID,
			Name:      pod.Name,
			Namespace: pod.Namespace,
			Status:    "Pod",
			Age:       pod.Age,
			Summary:   fmt.Sprintf("CPU %s, Memory %s", pod.CPU, pod.Memory),
		})
	}
	return items
}
