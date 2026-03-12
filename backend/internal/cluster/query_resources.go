package cluster

import (
	"context"
	"fmt"
	"strings"

	"k8s.io/apimachinery/pkg/api/resource"

	"kubelens-backend/internal/model"
)

func (s *Service) listRealResources(ctx context.Context, kind string) ([]model.ResourceRecord, error) {
	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	normalized := strings.ToLower(strings.TrimSpace(kind))
	if snapshot, ok := s.StateSnapshot(ctx); ok {
		switch normalized {
		case "pods":
			pods := podsFromState(snapshot)
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
			return items, nil
		case "nodes":
			return nodeResourceRecords(nodesFromState(snapshot)), nil
		case "deployments":
			return deploymentRecordsFromState(snapshot), nil
		case "events":
			return eventResourceRecords(eventsFromState(snapshot)), nil
		}
	}

	switch normalized {
	case "pods":
		return s.listRealPodResources(ctx), nil
	case "nodes":
		return s.listRealNodeResources(ctx), nil
	case "events":
		return s.listRealEventResources(ctx), nil
	case "metrics":
		return s.listRealMetricsResources(ctx), nil
	default:
		if items, handled, err := s.listRealAppsResources(callCtx, normalized); handled || err != nil {
			return items, err
		}
		if items, handled, err := s.listRealNetworkingResources(callCtx, normalized); handled || err != nil {
			return items, err
		}
		if items, handled, err := s.listRealStorageRBACResources(callCtx, normalized); handled || err != nil {
			return items, err
		}
		return nil, fmt.Errorf("unsupported resource kind: %s", kind)
	}
}

func (s *Service) listMockResources(kind string) []model.ResourceRecord {
	kind = strings.ToLower(strings.TrimSpace(kind))
	if kind == "events" {
		return eventResourceRecords(s.mockClusterEvents())
	}

	pods, nodes := s.mockSnapshot()
	namespaces := s.mockNamespaceList()

	switch kind {
	case "pods":
		items := make([]model.ResourceRecord, 0, len(pods))
		for _, pod := range pods {
			items = append(items, model.ResourceRecord{
				ID:        pod.ID,
				Name:      pod.Name,
				Namespace: pod.Namespace,
				Status:    string(pod.Status),
				Age:       pod.Age,
				Summary:   fmt.Sprintf("CPU %s, Memory %s", pod.CPU, pod.Memory),
			})
		}
		return items
	case "nodes":
		return nodeResourceRecords(nodes)
	case "namespaces":
		items := make([]model.ResourceRecord, 0, len(namespaces))
		for _, namespace := range namespaces {
			items = append(items, model.ResourceRecord{
				ID:      namespace,
				Name:    namespace,
				Status:  "Active",
				Age:     "30d",
				Summary: "Namespace",
			})
		}
		return items
	case "metrics":
		return metricResourceRecords(pods, nodes)
	default:
		return s.mockWorkloadResources(kind)
	}
}

func quantityToString(value *resource.Quantity) string {
	if value == nil {
		return "N/A"
	}
	return value.String()
}
