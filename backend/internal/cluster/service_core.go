package cluster

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
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
	group singleflight.Group

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

func (s *Service) withTimeout(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, s.apiTimeout)
}

func (s *Service) inMockMode() bool {
	return !s.isReal || s.client == nil
}

func (s *Service) cachedFresh() (cachedSlices, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if time.Now().After(s.cache.expiresAt) {
		return cachedSlices{}, false
	}
	return s.cache, true
}

func (s *Service) cachedAny() (cachedSlices, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	hasData := len(s.cache.pods) > 0 || len(s.cache.nodes) > 0 || len(s.cache.namespaces) > 0
	if !hasData {
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

func (s *Service) invalidateCache() {
	s.mu.Lock()
	s.cache = cachedSlices{}
	s.mu.Unlock()
}
