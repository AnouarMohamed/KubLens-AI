package cluster

import (
	"context"
	"errors"
	"sort"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"kubelens-backend/internal/model"
)

// Snapshot returns pods and nodes from the same cached/fetched view.
func (s *Service) Snapshot(ctx context.Context) ([]model.PodSummary, []model.NodeSummary) {
	if snapshot, ok := s.StateSnapshot(ctx); ok {
		return podsFromState(snapshot), nodesFromState(snapshot)
	}

	if s.inMockMode() {
		return s.mockSnapshot()
	}

	data, ok := s.cachedFresh()
	if ok {
		return append([]model.PodSummary(nil), data.pods...), cloneNodeSummaries(data.nodes)
	}

	result, err, _ := s.group.Do("snapshot", func() (any, error) {
		// Another request may have refreshed the cache while this call waited.
		if fresh, ok := s.cachedFresh(); ok {
			return fresh, nil
		}

		pods, nodes, fetchErr := s.fetchPodsAndNodes(context.WithoutCancel(ctx))
		if fetchErr != nil {
			return nil, fetchErr
		}

		refreshed := cachedSlices{
			pods:      append([]model.PodSummary(nil), pods...),
			nodes:     cloneNodeSummaries(nodes),
			expiresAt: time.Now().Add(s.cacheTTL),
		}
		s.storeCache(refreshed)
		return refreshed, nil
	})
	if err == nil {
		refreshed := result.(cachedSlices)
		return append([]model.PodSummary(nil), refreshed.pods...), cloneNodeSummaries(refreshed.nodes)
	}

	if stale, ok := s.cachedAny(); ok && len(stale.pods) > 0 && len(stale.nodes) > 0 {
		return append([]model.PodSummary(nil), stale.pods...), cloneNodeSummaries(stale.nodes)
	}

	// Preserve previous behavior as final fallback when real API is unavailable.
	return mockPods(), mockNodes()
}

func (s *Service) ListNamespaces(ctx context.Context) []string {
	if snapshot, ok := s.StateSnapshot(ctx); ok {
		if names := namespacesFromState(snapshot); len(names) > 0 {
			return names
		}
	}

	if s.inMockMode() {
		return s.mockNamespaceList()
	}

	data, ok := s.cachedFresh()
	if ok && len(data.namespaces) > 0 {
		return append([]string(nil), data.namespaces...)
	}

	result, err, _ := s.group.Do("namespaces", func() (any, error) {
		if fresh, ok := s.cachedFresh(); ok && len(fresh.namespaces) > 0 {
			return append([]string(nil), fresh.namespaces...), nil
		}

		callCtx, cancel := s.withTimeout(context.WithoutCancel(ctx))
		defer cancel()

		list, fetchErr := s.client.CoreV1().Namespaces().List(callCtx, metav1.ListOptions{})
		if fetchErr != nil {
			return nil, fetchErr
		}

		names := make([]string, 0, len(list.Items))
		for _, item := range list.Items {
			names = append(names, item.Name)
		}
		if len(names) == 0 {
			return nil, errors.New("no namespaces returned")
		}

		s.mergeCache(func(current *cachedSlices) {
			current.namespaces = append([]string(nil), names...)
			current.expiresAt = time.Now().Add(s.cacheTTL)
		})

		return names, nil
	})
	if err == nil {
		return result.([]string)
	}

	if stale, ok := s.cachedAny(); ok && len(stale.namespaces) > 0 {
		return append([]string(nil), stale.namespaces...)
	}

	return mockNamespaces()
}

func (s *Service) ListPods(ctx context.Context) []model.PodSummary {
	pods, _ := s.Snapshot(ctx)
	return pods
}

func (s *Service) ListNodes(ctx context.Context) []model.NodeSummary {
	_, nodes := s.Snapshot(ctx)
	return nodes
}

func (s *Service) fetchPodsAndNodes(ctx context.Context) ([]model.PodSummary, []model.NodeSummary, error) {
	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	var (
		podList   *corev1.PodList
		nodeList  *corev1.NodeList
		podErr    error
		nodeErr   error
		podUsage  map[string]resourceUsage
		nodeUsage map[string]resourceUsage
	)

	var wg sync.WaitGroup
	wg.Add(3)

	go func() {
		defer wg.Done()
		podList, podErr = s.client.CoreV1().Pods("").List(callCtx, metav1.ListOptions{})
	}()

	go func() {
		defer wg.Done()
		nodeList, nodeErr = s.client.CoreV1().Nodes().List(callCtx, metav1.ListOptions{})
	}()

	go func() {
		defer wg.Done()
		podUsage, nodeUsage = s.fetchUsage(callCtx)
	}()

	wg.Wait()

	if podErr != nil {
		return nil, nil, podErr
	}
	if nodeErr != nil {
		return nil, nil, nodeErr
	}

	pods := make([]model.PodSummary, 0, len(podList.Items))
	for _, pod := range podList.Items {
		summary := mapPodSummary(pod)
		if usage, ok := podUsage[podUsageKey(pod.Namespace, pod.Name)]; ok {
			summary.CPU = formatMilliCPU(usage.CPUMilli)
			summary.Memory = formatMemoryBytes(usage.MemoryBytes)
		}
		pods = append(pods, summary)
	}

	nodes := make([]model.NodeSummary, 0, len(nodeList.Items))
	for _, node := range nodeList.Items {
		summary := mapNodeSummary(node)
		if usage, ok := nodeUsage[node.Name]; ok {
			summary.CPUUsage = formatUsagePercent(usage.CPUMilli, node.Status.Allocatable.Cpu().MilliValue())
			summary.MemUsage = formatUsagePercent(usage.MemoryBytes, node.Status.Allocatable.Memory().Value())
		}
		nodes = append(nodes, summary)
	}

	return pods, nodes, nil
}

func (s *Service) ListClusterEvents(ctx context.Context) []model.K8sEvent {
	if snapshot, ok := s.StateSnapshot(ctx); ok {
		if events := eventsFromState(snapshot); len(events) > 0 {
			return events
		}
	}

	if s.inMockMode() {
		return s.mockClusterEvents()
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	list, err := s.client.CoreV1().Events("").List(callCtx, metav1.ListOptions{Limit: 250})
	if err != nil || len(list.Items) == 0 {
		return s.mockClusterEvents()
	}

	events := make([]model.K8sEvent, 0, len(list.Items))
	for _, event := range list.Items {
		lastSeen := event.LastTimestamp.Time
		if lastSeen.IsZero() {
			lastSeen = event.EventTime.Time
		}
		if lastSeen.IsZero() {
			lastSeen = event.CreationTimestamp.Time
		}

		events = append(events, model.K8sEvent{
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

	sort.SliceStable(events, func(i, j int) bool {
		return events[i].LastTimestamp > events[j].LastTimestamp
	})
	return events
}
