package cluster

import (
	"context"
	"encoding/base64"
	"encoding/json"
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
	k8stypes "k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	metricsclientset "k8s.io/metrics/pkg/client/clientset/versioned"

	"kubelens-backend/internal/apperrors"
	"kubelens-backend/internal/model"
)

const (
	defaultAPITimeout = 8 * time.Second
	defaultCacheTTL   = 5 * time.Second
)

var ErrNotFound = apperrors.ErrNotFound

type cachedSlices struct {
	namespaces []string
	pods       []model.PodSummary
	nodes      []model.NodeSummary
	expiresAt  time.Time
}

// Service provides cluster data with graceful fallback to deterministic mock data.
// For real clusters, list endpoints use short-lived caching to reduce API pressure
// and improve latency under request bursts.
type Service struct {
	client        kubernetes.Interface
	metricsClient metricsclientset.Interface
	isReal        bool
	apiTimeout    time.Duration
	cacheTTL      time.Duration

	mu    sync.RWMutex
	cache cachedSlices

	mockMu         sync.RWMutex
	mockPods       []model.PodSummary
	mockNodes      []model.NodeSummary
	mockNamespaces []string
	mockResources  map[string][]model.ResourceRecord
	mockManifests  map[string]string
}

// NewService initializes a cluster service.
// If KUBECONFIG_DATA is missing or invalid, the service falls back to mock mode.
func NewService(kubeconfigData string) (*Service, error) {
	svc := &Service{
		isReal:         false,
		apiTimeout:     defaultAPITimeout,
		cacheTTL:       defaultCacheTTL,
		mockPods:       mockPods(),
		mockNodes:      mockNodes(),
		mockNamespaces: mockNamespaces(),
		mockResources:  mockCatalogResourceStore(),
		mockManifests:  mockCatalogManifestStore(),
	}

	trimmed := strings.TrimSpace(kubeconfigData)
	if trimmed == "" {
		return svc, nil
	}

	rawConfig, err := base64.StdEncoding.DecodeString(trimmed)
	if err != nil {
		return svc, fmt.Errorf("invalid KUBECONFIG_DATA base64, using mock mode: %w", err)
	}

	restConfig, err := clientcmd.RESTConfigFromKubeConfig(rawConfig)
	if err != nil {
		return svc, fmt.Errorf("invalid kubeconfig payload, using mock mode: %w", err)
	}

	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return svc, fmt.Errorf("failed to initialize kubernetes client, using mock mode: %w", err)
	}

	metricsClient, err := metricsclientset.NewForConfig(restConfig)
	if err == nil {
		svc.metricsClient = metricsClient
	}

	svc.client = clientset
	svc.isReal = true
	return svc, nil
}

func (s *Service) IsRealCluster() bool {
	return s.isReal
}

// Snapshot returns pods and nodes from the same cached/fetched view.
func (s *Service) Snapshot(ctx context.Context) ([]model.PodSummary, []model.NodeSummary) {
	if s.inMockMode() {
		return s.mockSnapshot()
	}

	data, ok := s.cached()
	if ok {
		return append([]model.PodSummary(nil), data.pods...), cloneNodeSummaries(data.nodes)
	}

	pods, nodes, err := s.fetchPodsAndNodes(ctx)
	if err != nil || len(pods) == 0 || len(nodes) == 0 {
		// Preserve previous behavior: return mock data if real API is unavailable.
		return mockPods(), mockNodes()
	}

	s.storeCache(cachedSlices{
		pods:      append([]model.PodSummary(nil), pods...),
		nodes:     cloneNodeSummaries(nodes),
		expiresAt: time.Now().Add(s.cacheTTL),
	})

	return pods, nodes
}

func (s *Service) ListNamespaces(ctx context.Context) []string {
	if s.inMockMode() {
		return s.mockNamespaceList()
	}

	data, ok := s.cached()
	if ok && len(data.namespaces) > 0 {
		return append([]string(nil), data.namespaces...)
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	list, err := s.client.CoreV1().Namespaces().List(callCtx, metav1.ListOptions{})
	if err != nil {
		return mockNamespaces()
	}

	names := make([]string, 0, len(list.Items))
	for _, item := range list.Items {
		names = append(names, item.Name)
	}

	if len(names) == 0 {
		return mockNamespaces()
	}

	s.mergeCache(func(data *cachedSlices) {
		data.namespaces = append([]string(nil), names...)
		data.expiresAt = time.Now().Add(s.cacheTTL)
	})

	return names
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
			Count:         event.Count,
			LastTimestamp: formatRFC3339(lastSeen),
		})
	}
	return events
}

func (s *Service) PodLogs(ctx context.Context, namespace, name string) string {
	if s.inMockMode() {
		return mockPodLogs(name)
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	tailLines := int64(150)
	req := s.client.CoreV1().Pods(namespace).GetLogs(name, &corev1.PodLogOptions{TailLines: &tailLines})
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

func (s *Service) NodeDetail(ctx context.Context, name string) (model.NodeDetail, error) {
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

	podList, err := s.client.CoreV1().Pods("").List(callCtx, metav1.ListOptions{})
	if err != nil {
		return nil, nil, err
	}

	nodeList, err := s.client.CoreV1().Nodes().List(callCtx, metav1.ListOptions{})
	if err != nil {
		return nil, nil, err
	}

	podUsage, nodeUsage := s.fetchUsage(callCtx)

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

func (s *Service) withTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, s.apiTimeout)
}

func (s *Service) inMockMode() bool {
	return !s.isReal || s.client == nil
}

func (s *Service) cached() (cachedSlices, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if time.Now().After(s.cache.expiresAt) {
		return cachedSlices{}, false
	}
	return s.cache, true
}

func (s *Service) storeCache(data cachedSlices) {
	s.mu.Lock()
	s.cache = data
	s.mu.Unlock()
}

func (s *Service) mergeCache(mutator func(*cachedSlices)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	mutator(&s.cache)
}

func (s *Service) ListResources(ctx context.Context, kind string) ([]model.ResourceRecord, error) {
	if s.inMockMode() {
		return s.listMockResources(kind), nil
	}
	return s.listRealResources(ctx, kind)
}

func (s *Service) ListClusterEvents(ctx context.Context) []model.K8sEvent {
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
			Count:         event.Count,
			LastTimestamp: formatRFC3339(lastSeen),
		})
	}

	sort.SliceStable(events, func(i, j int) bool {
		return events[i].LastTimestamp > events[j].LastTimestamp
	})
	return events
}

func (s *Service) CreatePod(ctx context.Context, req model.PodCreateRequest) (model.ActionResult, error) {
	namespace := strings.TrimSpace(req.Namespace)
	if namespace == "" {
		namespace = "default"
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return model.ActionResult{}, fmt.Errorf("pod name is required")
	}

	image := strings.TrimSpace(req.Image)
	if image == "" {
		image = "nginx:latest"
	}

	if s.inMockMode() {
		return s.mockCreatePod(namespace, name, image)
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: namespace,
			Labels: map[string]string{
				"app.kubernetes.io/managed-by": "kubelens",
			},
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{
					Name:  "main",
					Image: image,
				},
			},
		},
	}

	if _, err := s.client.CoreV1().Pods(namespace).Create(callCtx, pod, metav1.CreateOptions{}); err != nil {
		return model.ActionResult{}, fmt.Errorf("create pod: %w", err)
	}

	return model.ActionResult{
		Success: true,
		Message: fmt.Sprintf("Pod %s/%s created", namespace, name),
	}, nil
}

func (s *Service) RestartPod(ctx context.Context, namespace, name string) (model.ActionResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)
	if namespace == "" || name == "" {
		return model.ActionResult{}, errors.New("namespace and name are required")
	}

	if s.inMockMode() {
		return s.mockRestartPod(namespace, name)
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	grace := int64(0)
	policy := metav1.DeletePropagationBackground
	if err := s.client.CoreV1().Pods(namespace).Delete(callCtx, name, metav1.DeleteOptions{
		GracePeriodSeconds: &grace,
		PropagationPolicy:  &policy,
	}); err != nil {
		if apierrors.IsNotFound(err) {
			return model.ActionResult{}, ErrNotFound
		}
		return model.ActionResult{}, fmt.Errorf("restart pod: %w", err)
	}

	return model.ActionResult{
		Success: true,
		Message: fmt.Sprintf("Restart triggered for pod %s/%s", namespace, name),
	}, nil
}

func (s *Service) DeletePod(ctx context.Context, namespace, name string) (model.ActionResult, error) {
	namespace = strings.TrimSpace(namespace)
	name = strings.TrimSpace(name)
	if namespace == "" || name == "" {
		return model.ActionResult{}, errors.New("namespace and name are required")
	}

	if s.inMockMode() {
		return s.mockDeletePod(namespace, name)
	}

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	if err := s.client.CoreV1().Pods(namespace).Delete(callCtx, name, metav1.DeleteOptions{}); err != nil {
		if apierrors.IsNotFound(err) {
			return model.ActionResult{}, ErrNotFound
		}
		return model.ActionResult{}, fmt.Errorf("delete pod: %w", err)
	}

	return model.ActionResult{
		Success: true,
		Message: fmt.Sprintf("Pod %s/%s deleted", namespace, name),
	}, nil
}

func (s *Service) CordonNode(ctx context.Context, name string) (model.ActionResult, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return model.ActionResult{}, errors.New("node name is required")
	}

	if s.inMockMode() {
		return s.mockCordonNode(name)
	}

	body, _ := json.Marshal(map[string]any{
		"spec": map[string]bool{
			"unschedulable": true,
		},
	})

	callCtx, cancel := s.withTimeout(ctx)
	defer cancel()

	if _, err := s.client.CoreV1().Nodes().Patch(callCtx, name, k8stypes.MergePatchType, body, metav1.PatchOptions{}); err != nil {
		if apierrors.IsNotFound(err) {
			return model.ActionResult{}, ErrNotFound
		}
		return model.ActionResult{}, fmt.Errorf("cordon node: %w", err)
	}

	return model.ActionResult{
		Success: true,
		Message: fmt.Sprintf("Node %s cordoned", name),
	}, nil
}
