package cluster

import (
	"context"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
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

func (s *Service) PodDetail(ctx context.Context, namespace, name string) (model.PodDetail, error) {
	if snapshot, ok := s.StateSnapshot(ctx); ok {
		if detail, found := podDetailFromState(snapshot, namespace, name); found {
			return detail, nil
		}
	}

	if s.inMockMode() {
		return s.mockPodDetail(namespace, name)
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	pod, err := s.client.CoreV1().Pods(namespace).Get(callCtx, name, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			return model.PodDetail{}, ErrNotFound
		}
		return model.PodDetail{}, fmt.Errorf("read pod detail: %w", err)
	}

	detail := model.PodDetail{
		PodSummary: mapPodSummary(*pod),
		NodeName:   pod.Spec.NodeName,
		HostIP:     pod.Status.HostIP,
		PodIP:      pod.Status.PodIP,
		Containers: make([]model.ContainerSpec, 0, len(pod.Spec.Containers)),
		Volumes:    make([]model.NamedVolume, 0, len(pod.Spec.Volumes)),
	}

	for _, container := range pod.Spec.Containers {
		detail.Containers = append(detail.Containers, mapContainerSpec(container))
	}
	for _, volume := range pod.Spec.Volumes {
		detail.Volumes = append(detail.Volumes, model.NamedVolume{Name: volume.Name})
	}

	return detail, nil
}

func (s *Service) PodEvents(ctx context.Context, namespace, name string) []model.K8sEvent {
	if snapshot, ok := s.StateSnapshot(ctx); ok {
		events := podEventsFromState(snapshot, namespace, name)
		if len(events) > 0 {
			return events
		}
	}

	if s.inMockMode() {
		return mockPodEvents(name)
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	list, err := s.client.CoreV1().Events(namespace).List(callCtx, metav1.ListOptions{
		FieldSelector: fmt.Sprintf("involvedObject.name=%s", name),
	})
	if err != nil || len(list.Items) == 0 {
		return mockPodEvents(name)
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
	return events
}

func (s *Service) PodLogs(ctx context.Context, namespace, name, container string, lines int) string {
	if s.inMockMode() {
		return mockPodLogs(name)
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	if lines <= 0 {
		lines = 150
	}
	tailLines := int64(lines)
	opts := &corev1.PodLogOptions{TailLines: &tailLines}
	if trimmed := strings.TrimSpace(container); trimmed != "" {
		opts.Container = trimmed
	}
	req := s.client.CoreV1().Pods(namespace).GetLogs(name, opts)
	stream, err := req.Stream(callCtx)
	if err != nil {
		return mockPodLogs(name)
	}
	defer stream.Close()

	body, err := io.ReadAll(stream)
	if err != nil || len(body) == 0 {
		return mockPodLogs(name)
	}
	return string(body)
}

func (s *Service) StreamPodLogs(ctx context.Context, namespace, name, container string, lines int) (io.ReadCloser, error) {
	if s.inMockMode() {
		return io.NopCloser(strings.NewReader(mockPodLogs(name))), nil
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	if lines <= 0 {
		lines = 150
	}
	tailLines := int64(lines)
	opts := &corev1.PodLogOptions{
		Follow:    true,
		TailLines: &tailLines,
	}
	if trimmed := strings.TrimSpace(container); trimmed != "" {
		opts.Container = trimmed
	}
	req := s.client.CoreV1().Pods(namespace).GetLogs(name, opts)
	return req.Stream(callCtx)
}

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

func (s *Service) ListResources(ctx context.Context, kind string) ([]model.ResourceRecord, error) {
	if s.inMockMode() {
		return s.listMockResources(kind), nil
	}
	return s.listRealResources(ctx, kind)
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
