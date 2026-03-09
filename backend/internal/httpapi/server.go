package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"kubelens-backend/internal/ai"
	"kubelens-backend/internal/events"
	"kubelens-backend/internal/intelligence"
	"kubelens-backend/internal/model"
	"kubelens-backend/internal/state"
)

type ClusterReader interface {
	IsRealCluster() bool
	Snapshot(ctx context.Context) ([]model.PodSummary, []model.NodeSummary)
	ListNamespaces(ctx context.Context) []string
	ListResources(ctx context.Context, kind string) ([]model.ResourceRecord, error)
	ListClusterEvents(ctx context.Context) []model.K8sEvent
	GetResourceYAML(ctx context.Context, kind, namespace, name string) (string, error)
	ApplyResourceYAML(ctx context.Context, kind, namespace, name, manifestYAML string) (model.ActionResult, error)
	ScaleResource(ctx context.Context, kind, namespace, name string, replicas int32) (model.ActionResult, error)
	RestartResource(ctx context.Context, kind, namespace, name string) (model.ActionResult, error)
	RollbackResource(ctx context.Context, kind, namespace, name string) (model.ActionResult, error)
	PodEvents(ctx context.Context, namespace, name string) []model.K8sEvent
	PodLogs(ctx context.Context, namespace, name, container string, lines int) string
	StreamPodLogs(ctx context.Context, namespace, name, container string, lines int) (io.ReadCloser, error)
	PodDetail(ctx context.Context, namespace, name string) (model.PodDetail, error)
	NodeDetail(ctx context.Context, name string) (model.NodeDetail, error)
	CreatePod(ctx context.Context, req model.PodCreateRequest) (model.ActionResult, error)
	RestartPod(ctx context.Context, namespace, name string) (model.ActionResult, error)
	DeletePod(ctx context.Context, namespace, name string) (model.ActionResult, error)
	CordonNode(ctx context.Context, name string) (model.ActionResult, error)
	StateSnapshot(ctx context.Context) (state.ClusterState, bool)
}

type Server struct {
	cluster   ClusterReader
	now       func() time.Time
	logger    *slog.Logger
	metrics   *requestMetrics
	runtime   model.RuntimeStatus
	auth      authRuntime
	limiter   rateLimiter
	writesOn  bool
	anonPerms []string
	audit     *auditLog
	eventBus  *events.Bus
	alerts    alertDispatcher
	ai        ai.Provider
	aiTTL     time.Duration
	docs      docsRetriever
	predictor predictionProvider
	buildInfo model.BuildInfo
	intel     *intelligence.Analyzer

	predictionsTTL   time.Duration
	predictionsMu    sync.RWMutex
	predictionsCache predictionsCacheEntry

	predictorHealthMu sync.RWMutex
	predictorHealth   predictorHealthState
}

type predictionsCacheEntry struct {
	data      model.PredictionsResult
	expiresAt time.Time
}

type predictorHealthState struct {
	enabled     bool
	lastSuccess time.Time
	lastFailure time.Time
	lastError   string
}

type docsRetriever interface {
	Enabled() bool
	Retrieve(ctx context.Context, query string, limit int) []model.DocumentationReference
}

type alertDispatcher interface {
	Dispatch(ctx context.Context, req model.AlertDispatchRequest) model.AlertDispatchResponse
	Enabled() bool
}

type Option func(*Server)

func WithAIProvider(provider ai.Provider) Option {
	return func(s *Server) {
		s.ai = provider
	}
}

func WithAITimeout(timeout time.Duration) Option {
	return func(s *Server) {
		if timeout > 0 {
			s.aiTTL = timeout
		}
	}
}

func WithDocsRetriever(retriever docsRetriever) Option {
	return func(s *Server) {
		s.docs = retriever
	}
}

func WithPredictor(baseURL string, timeout time.Duration, sharedSecret string) Option {
	return func(s *Server) {
		if baseURL == "" {
			return
		}
		s.predictor = newPredictorClient(baseURL, timeout, sharedSecret)
		s.predictorHealthMu.Lock()
		s.predictorHealth.enabled = true
		s.predictorHealthMu.Unlock()
	}
}

func WithAlertDispatcher(dispatcher alertDispatcher) Option {
	return func(s *Server) {
		s.alerts = dispatcher
	}
}

func WithEventBus(bus *events.Bus) Option {
	return func(s *Server) {
		s.eventBus = bus
	}
}

func WithIntelligence(analyzer *intelligence.Analyzer) Option {
	return func(s *Server) {
		s.intel = analyzer
	}
}

func WithPredictionsTTL(ttl time.Duration) Option {
	return func(s *Server) {
		if ttl > 0 {
			s.predictionsTTL = ttl
		}
	}
}

func WithBuildInfo(info model.BuildInfo) Option {
	return func(s *Server) {
		if info.Version != "" {
			s.buildInfo.Version = info.Version
		}
		if info.Commit != "" {
			s.buildInfo.Commit = info.Commit
		}
		if info.BuiltAt != "" {
			s.buildInfo.BuiltAt = info.BuiltAt
		}
	}
}

func WithRuntimeStatus(status model.RuntimeStatus) Option {
	return func(s *Server) {
		s.runtime = status
	}
}

func WithWriteActionsEnabled(enabled bool) Option {
	return func(s *Server) {
		s.writesOn = enabled
	}
}

func WithAnonymousPermissions(permissions []string) Option {
	return func(s *Server) {
		s.anonPerms = append([]string(nil), permissions...)
	}
}

func New(clusterSvc ClusterReader, opts ...Option) *Server {
	return newServer(clusterSvc, time.Now, slog.New(slog.NewJSONHandler(os.Stdout, nil)), opts...)
}

func newServer(clusterSvc ClusterReader, now func() time.Time, logger *slog.Logger, opts ...Option) *Server {
	if now == nil {
		now = time.Now
	}
	if logger == nil {
		logger = slog.Default()
	}

	server := &Server{
		cluster:        clusterSvc,
		now:            now,
		logger:         logger,
		metrics:        newRequestMetrics(now),
		audit:          newAuditLog(maxAuditLimit, "", logger),
		eventBus:       events.NewBus(64),
		aiTTL:          8 * time.Second,
		predictionsTTL: 8 * time.Second,
		buildInfo: model.BuildInfo{
			Version: "dev",
			Commit:  "local",
			BuiltAt: now().UTC().Format(time.RFC3339),
		},
		writesOn:  false,
		anonPerms: []string{"read", "assist", "stream"},
		runtime: model.RuntimeStatus{
			Mode:                "demo",
			Insecure:            true,
			WriteActionsEnabled: false,
			PredictorHealthy:    true,
		},
	}
	server.limiter.configure(RateLimitConfig{
		Enabled:  true,
		Requests: 300,
		Window:   time.Minute,
	})

	for _, opt := range opts {
		opt(server)
	}

	if server.eventBus == nil {
		server.eventBus = events.NewBus(64)
	}

	return server
}

func (s *Server) Router(distDir string) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(timeoutUnlessPath(20*time.Second, apiStreamPrefix))
	r.Use(s.limiter.middleware(s.now))
	r.Use(s.metrics.middleware(s.logger))
	r.Use(s.authMiddleware)
	r.Use(s.clusterMiddleware)
	r.Use(s.auditMiddleware)

	// Mutating endpoints are guarded centrally by auth middleware:
	// 1) RBAC role check via auth.RequiredRole
	// 2) environment write gate via s.writesOn
	// Non-mutating POST exceptions (assistant/clusters/select) are documented in auth.RequiredRole.
	r.Route(apiMountPrefix, func(api chi.Router) {
		api.Get("/healthz", s.handleHealthz)
		api.Get("/readyz", s.handleReadyz)
		api.Get("/openapi.yaml", s.handleOpenAPIYAML)
		api.Get("/auth/session", s.handleAuthSession)
		api.Post("/auth/login", s.handleAuthLogin)
		api.Post("/auth/logout", s.handleAuthLogout)
		api.Get("/clusters", s.handleClusters)
		api.Post("/clusters/select", s.handleSelectCluster)
		api.Get("/version", s.handleVersion)
		api.Get("/runtime", s.handleRuntime)
		api.Get("/cluster-info", s.handleClusterInfo)
		api.Get("/metrics", s.handleMetrics)
		api.Get("/metrics/prometheus", s.handlePrometheusMetrics)
		api.Post("/alerts/dispatch", s.handleAlertDispatch)
		api.Post("/alerts/test", s.handleAlertTest)
		api.Get("/audit", s.handleAuditLog)
		api.Get("/stream", s.handleStream)
		api.Get("/stream/ws", s.handleStreamWebSocket)
		api.Get("/namespaces", s.handleNamespaces)
		api.Get("/pods", s.handlePods)
		api.Get("/nodes", s.handleNodes)
		api.Get("/resources/{kind}", s.handleResources)
		api.Get("/resources/{kind}/{namespace}/{name}/yaml", s.handleGetResourceYAML)
		api.Put("/resources/{kind}/{namespace}/{name}/yaml", s.handleApplyResourceYAML)
		api.Post("/resources/{kind}/{namespace}/{name}/scale", s.handleScaleResource)
		api.Post("/resources/{kind}/{namespace}/{name}/restart", s.handleRestartResource)
		api.Post("/resources/{kind}/{namespace}/{name}/rollback", s.handleRollbackResource)
		api.Get("/events", s.handleEvents)
		api.Post("/pods", s.handleCreatePod)
		api.Get("/pods/{namespace}/{name}/events", s.handlePodEvents)
		api.Get("/pods/{namespace}/{name}/logs", s.handlePodLogs)
		api.Get("/pods/{namespace}/{name}/logs/stream", s.handlePodLogsStream)
		api.Get("/pods/{namespace}/{name}/describe", s.handlePodDescribe)
		api.Post("/pods/{namespace}/{name}/restart", s.handleRestartPod)
		api.Delete("/pods/{namespace}/{name}", s.handleDeletePod)
		api.Get("/pods/{namespace}/{name}", s.handlePodDetail)
		api.Post("/nodes/{name}/cordon", s.handleCordonNode)
		api.Get("/nodes/{name}", s.handleNodeDetail)
		api.Get("/stats", s.handleStats)
		api.Get("/diagnostics", s.handleDiagnostics)
		api.Get("/predictions", s.handlePredictions)
		api.Get("/predictive-incidents", s.handlePredictions) // Backward-compatible alias for older frontend builds.
		api.Post("/assistant", s.handleAssistant)
	})

	attachStatic(r, distDir)
	return otelhttp.NewHandler(
		r,
		"http.server",
		otelhttp.WithSpanNameFormatter(func(operation string, r *http.Request) string {
			route := routePattern(r)
			if route == "" {
				route = operation
			}
			return r.Method + " " + route
		}),
	)
}
