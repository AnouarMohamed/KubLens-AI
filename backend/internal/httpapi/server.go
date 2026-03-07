package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"kubelens-backend/internal/ai"
	"kubelens-backend/internal/model"
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
	PodLogs(ctx context.Context, namespace, name string) string
	PodDetail(ctx context.Context, namespace, name string) (model.PodDetail, error)
	NodeDetail(ctx context.Context, name string) (model.NodeDetail, error)
	CreatePod(ctx context.Context, req model.PodCreateRequest) (model.ActionResult, error)
	RestartPod(ctx context.Context, namespace, name string) (model.ActionResult, error)
	DeletePod(ctx context.Context, namespace, name string) (model.ActionResult, error)
	CordonNode(ctx context.Context, name string) (model.ActionResult, error)
}

type Server struct {
	cluster   ClusterReader
	now       func() time.Time
	logger    *slog.Logger
	metrics   *requestMetrics
	auth      authRuntime
	limiter   rateLimiter
	terminal  terminalRuntimePolicy
	audit     *auditLog
	stream    *streamHub
	alerts    alertDispatcher
	ai        ai.Provider
	aiTTL     time.Duration
	docs      docsRetriever
	predictor predictionProvider
	buildInfo model.BuildInfo

	predictionsTTL   time.Duration
	predictionsMu    sync.RWMutex
	predictionsCache predictionsCacheEntry
}

type predictionsCacheEntry struct {
	data      model.PredictionsResult
	expiresAt time.Time
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

func WithPredictor(baseURL string, timeout time.Duration) Option {
	return func(s *Server) {
		if baseURL == "" {
			return
		}
		s.predictor = newPredictorClient(baseURL, timeout)
	}
}

func WithAlertDispatcher(dispatcher alertDispatcher) Option {
	return func(s *Server) {
		s.alerts = dispatcher
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
		stream:         newStreamHub(),
		aiTTL:          8 * time.Second,
		predictionsTTL: 8 * time.Second,
		buildInfo: model.BuildInfo{
			Version: "dev",
			Commit:  "local",
			BuiltAt: now().UTC().Format(time.RFC3339),
		},
	}
	server.limiter.configure(RateLimitConfig{
		Enabled:  true,
		Requests: 300,
		Window:   time.Minute,
	})
	server.terminal.configure(TerminalPolicy{
		Enabled: true,
	})

	for _, opt := range opts {
		opt(server)
	}

	return server
}

func (s *Server) Router(distDir string) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(timeoutUnlessPath(20*time.Second, "/api/stream"))
	r.Use(s.limiter.middleware(s.now))
	r.Use(s.metrics.middleware(s.logger))
	r.Use(s.authMiddleware)
	r.Use(s.clusterMiddleware)
	r.Use(s.auditMiddleware)

	r.Route("/api", func(api chi.Router) {
		api.Get("/auth/session", s.handleAuthSession)
		api.Post("/auth/login", s.handleAuthLogin)
		api.Post("/auth/logout", s.handleAuthLogout)
		api.Get("/clusters", s.handleClusters)
		api.Post("/clusters/select", s.handleSelectCluster)
		api.Get("/version", s.handleVersion)
		api.Get("/cluster-info", s.handleClusterInfo)
		api.Get("/metrics", s.handleMetrics)
		api.Post("/alerts/dispatch", s.handleAlertDispatch)
		api.Post("/alerts/test", s.handleAlertTest)
		api.Get("/audit", s.handleAuditLog)
		api.Get("/stream", s.handleStream)
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
		api.Post("/terminal/exec", s.handleTerminalExec)
	})

	attachStatic(r, distDir)
	return r
}
