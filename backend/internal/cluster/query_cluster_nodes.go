package cluster

import (
	"context"
	"fmt"
	"sort"
	"strings"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"kubelens-backend/internal/model"
)

func (s *Service) NodeDetail(ctx context.Context, name string) (model.NodeDetail, error) {
	if snapshot, ok := s.StateSnapshot(ctx); ok {
		if detail, found := nodeDetailFromState(snapshot, name); found {
			return detail, nil
		}
	}

	if s.inMockMode() {
		return s.mockNodeDetail(name)
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	node, err := s.client.CoreV1().Nodes().Get(callCtx, name, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			return model.NodeDetail{}, ErrNotFound
		}
		return model.NodeDetail{}, fmt.Errorf("read node detail: %w", err)
	}

	detail := model.NodeDetail{
		NodeSummary: mapNodeSummary(*node),
		Capacity: model.ResourceCapacity{
			CPU:    node.Status.Capacity.Cpu().String(),
			Memory: node.Status.Capacity.Memory().String(),
			Pods:   node.Status.Capacity.Pods().String(),
		},
		Allocatable: model.ResourceCapacity{
			CPU:    node.Status.Allocatable.Cpu().String(),
			Memory: node.Status.Allocatable.Memory().String(),
			Pods:   node.Status.Allocatable.Pods().String(),
		},
		Conditions: make([]model.NodeCondition, 0, len(node.Status.Conditions)),
		Addresses:  make([]model.NodeAddress, 0, len(node.Status.Addresses)),
	}

	for _, condition := range node.Status.Conditions {
		detail.Conditions = append(detail.Conditions, model.NodeCondition{
			Type:               string(condition.Type),
			Status:             string(condition.Status),
			LastTransitionTime: condition.LastTransitionTime.Time.Local().Format("2006-01-02 15:04:05"),
			Reason:             condition.Reason,
			Message:            condition.Message,
		})
	}
	for _, address := range node.Status.Addresses {
		detail.Addresses = append(detail.Addresses, model.NodeAddress{
			Type:    string(address.Type),
			Address: address.Address,
		})
	}

	return detail, nil
}

func (s *Service) NodePods(ctx context.Context, name string) ([]model.PodSummary, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("node name is required")
	}

	if snapshot, ok := s.StateSnapshot(ctx); ok {
		pods := podsFromState(snapshot)
		out := make([]model.PodSummary, 0, len(pods))
		for _, pod := range pods {
			if pod.NodeName == name {
				out = append(out, pod)
			}
		}
		return out, nil
	}

	if s.inMockMode() {
		pods, _ := s.mockSnapshot()
		out := make([]model.PodSummary, 0, len(pods))
		for _, pod := range pods {
			if pod.NodeName == name {
				out = append(out, pod)
			}
		}
		return out, nil
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	if _, err := s.client.CoreV1().Nodes().Get(callCtx, name, metav1.GetOptions{}); err != nil {
		if apierrors.IsNotFound(err) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("read node: %w", err)
	}

	list, err := s.client.CoreV1().Pods("").List(callCtx, metav1.ListOptions{
		FieldSelector: "spec.nodeName=" + name,
	})
	if err != nil {
		return nil, fmt.Errorf("list node pods: %w", err)
	}

	podUsage, _ := s.fetchUsage(callCtx)
	out := make([]model.PodSummary, 0, len(list.Items))
	for _, pod := range list.Items {
		summary := mapPodSummary(pod)
		if usage, ok := podUsage[podUsageKey(pod.Namespace, pod.Name)]; ok {
			summary.CPU = formatMilliCPU(usage.CPUMilli)
			summary.Memory = formatMemoryBytes(usage.MemoryBytes)
		}
		out = append(out, summary)
	}
	return out, nil
}

func (s *Service) NodeEvents(ctx context.Context, name string) ([]model.K8sEvent, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("node name is required")
	}

	if snapshot, ok := s.StateSnapshot(ctx); ok {
		out := make([]model.K8sEvent, 0, len(snapshot.Events))
		for _, event := range snapshot.Events {
			if !strings.EqualFold(event.InvolvedObjectKind, "Node") {
				continue
			}
			if event.InvolvedObjectName != name {
				continue
			}
			out = append(out, mapK8sEventFromState(event))
		}
		sort.SliceStable(out, func(i, j int) bool {
			return out[i].LastTimestamp > out[j].LastTimestamp
		})
		return out, nil
	}

	if s.inMockMode() {
		events := s.mockClusterEvents()
		out := make([]model.K8sEvent, 0, len(events))
		for _, event := range events {
			if !strings.EqualFold(event.ResourceKind, "Node") {
				continue
			}
			if event.Resource != name {
				continue
			}
			out = append(out, event)
		}
		return out, nil
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	if _, err := s.client.CoreV1().Nodes().Get(callCtx, name, metav1.GetOptions{}); err != nil {
		if apierrors.IsNotFound(err) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("read node: %w", err)
	}

	list, err := s.client.CoreV1().Events("").List(callCtx, metav1.ListOptions{
		FieldSelector: fmt.Sprintf("involvedObject.kind=Node,involvedObject.name=%s", name),
	})
	if err != nil {
		return nil, fmt.Errorf("list node events: %w", err)
	}

	out := make([]model.K8sEvent, 0, len(list.Items))
	for _, event := range list.Items {
		lastSeen := event.LastTimestamp.Time
		if lastSeen.IsZero() {
			lastSeen = event.EventTime.Time
		}
		if lastSeen.IsZero() {
			lastSeen = event.CreationTimestamp.Time
		}

		out = append(out, model.K8sEvent{
			Type:          event.Type,
			Reason:        event.Reason,
			Age:           formatAge(lastSeen),
			From:          firstNonEmpty(event.ReportingController, event.Source.Component, "kubernetes"),
			Message:       event.Message,
			Namespace:     event.Namespace,
			Resource:      event.InvolvedObject.Name,
			ResourceKind:  event.InvolvedObject.Kind,
			Count:         event.Count,
			LastTimestamp: formatRFC3339(lastSeen),
		})
	}

	sort.SliceStable(out, func(i, j int) bool {
		return out[i].LastTimestamp > out[j].LastTimestamp
	})
	return out, nil
}
