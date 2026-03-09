package state

import (
	"context"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"k8s.io/client-go/informers"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
	metricsclientset "k8s.io/metrics/pkg/client/clientset/versioned"

	"kubelens-backend/internal/events"
)

const (
	defaultMetricsInterval = 15 * time.Second
	defaultResyncPeriod    = 5 * time.Minute
	maxUsageSamples        = 12
)

type Config struct {
	MetricsInterval time.Duration
	ResyncPeriod    time.Duration
	Events          *events.Bus
	Logger          *slog.Logger
}

// ClusterCache keeps a live, informer-backed snapshot of cluster state.
type ClusterCache struct {
	client        kubernetes.Interface
	metricsClient metricsclientset.Interface

	factory informers.SharedInformerFactory
	pods    cache.SharedIndexInformer
	nodes   cache.SharedIndexInformer
	deploys cache.SharedIndexInformer
	events  cache.SharedIndexInformer

	mu    sync.RWMutex
	state ClusterState

	bus     *events.Bus
	logger  *slog.Logger
	ready   atomic.Bool
	started atomic.Bool

	metricsInterval time.Duration
	resyncPeriod    time.Duration
}

// NewClusterCache initializes a cache wrapper for cluster informers.
func NewClusterCache(client kubernetes.Interface, metricsClient metricsclientset.Interface, cfg Config) *ClusterCache {
	interval := cfg.MetricsInterval
	if interval <= 0 {
		interval = defaultMetricsInterval
	}
	resync := cfg.ResyncPeriod
	if resync <= 0 {
		resync = defaultResyncPeriod
	}

	cache := &ClusterCache{
		client:          client,
		metricsClient:   metricsClient,
		bus:             cfg.Events,
		logger:          cfg.Logger,
		metricsInterval: interval,
		resyncPeriod:    resync,
		state: ClusterState{
			Pods:        map[string]PodInfo{},
			Nodes:       map[string]NodeInfo{},
			Deployments: map[string]DeploymentInfo{},
			Events:      []EventInfo{},
		},
	}
	return cache
}

// Start begins informer processing and metric polling. It is safe to call once.
func (c *ClusterCache) Start(ctx context.Context) error {
	if c == nil || c.client == nil {
		return nil
	}
	if c.started.Load() {
		return nil
	}
	c.started.Store(true)

	c.factory = informers.NewSharedInformerFactory(c.client, c.resyncPeriod)
	c.pods = c.factory.Core().V1().Pods().Informer()
	c.nodes = c.factory.Core().V1().Nodes().Informer()
	c.deploys = c.factory.Apps().V1().Deployments().Informer()
	c.events = c.factory.Core().V1().Events().Informer()

	c.pods.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    c.onPodAdd,
		UpdateFunc: c.onPodUpdate,
		DeleteFunc: c.onPodDelete,
	})
	c.nodes.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    c.onNodeAdd,
		UpdateFunc: c.onNodeUpdate,
		DeleteFunc: c.onNodeDelete,
	})
	c.deploys.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    c.onDeploymentAdd,
		UpdateFunc: c.onDeploymentUpdate,
		DeleteFunc: c.onDeploymentDelete,
	})
	c.events.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    c.onEventAdd,
		UpdateFunc: c.onEventUpdate,
		DeleteFunc: c.onEventDelete,
	})

	c.factory.Start(ctx.Done())
	synced := cache.WaitForCacheSync(ctx.Done(), c.pods.HasSynced, c.nodes.HasSynced, c.deploys.HasSynced, c.events.HasSynced)
	c.ready.Store(synced)

	go c.runMetricsPoller(ctx)
	return nil
}

// Ready reports whether informer caches have synced at least once.
func (c *ClusterCache) Ready() bool {
	if c == nil {
		return false
	}
	return c.ready.Load()
}

// Snapshot returns a deep copy of the cached cluster state.
func (c *ClusterCache) Snapshot() ClusterState {
	c.mu.RLock()
	defer c.mu.RUnlock()

	out := ClusterState{
		Pods:        make(map[string]PodInfo, len(c.state.Pods)),
		Nodes:       make(map[string]NodeInfo, len(c.state.Nodes)),
		Deployments: make(map[string]DeploymentInfo, len(c.state.Deployments)),
		Events:      make([]EventInfo, len(c.state.Events)),
		LastUpdated: c.state.LastUpdated,
	}
	for key, pod := range c.state.Pods {
		out.Pods[key] = pod.clone()
	}
	for key, node := range c.state.Nodes {
		out.Nodes[key] = node.clone()
	}
	for key, deploy := range c.state.Deployments {
		out.Deployments[key] = deploy.clone()
	}
	copy(out.Events, c.state.Events)
	return out
}

func (c *ClusterCache) setLastUpdated() {
	c.state.LastUpdated = time.Now().UTC()
}

func (c *ClusterCache) publish(eventType string, payload any) {
	if c.bus == nil {
		return
	}
	c.bus.Publish(events.Event{
		Type:      eventType,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Payload:   payload,
	})
}

func (c *ClusterCache) runMetricsPoller(ctx context.Context) {
	if c.metricsClient == nil {
		return
	}

	ticker := time.NewTicker(c.metricsInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := c.refreshUsage(ctx); err != nil && c.logger != nil {
				c.logger.Warn("metrics refresh failed", "error", err.Error())
			}
		}
	}
}
