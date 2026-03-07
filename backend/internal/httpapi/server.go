package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"kubelens-backend/internal/ai"
	"kubelens-backend/internal/model"
)

type clusterReader interface {
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
	cluster   clusterReader
	now       func() time.Time
	logger    *slog.Logger
	metrics   *requestMetrics
	ai        ai.Provider
	aiTTL     time.Duration
	predictor predictionProvider
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

func WithPredictor(baseURL string, timeout time.Duration) Option {
	return func(s *Server) {
		if baseURL == "" {
			return
		}
		s.predictor = newPredictorClient(baseURL, timeout)
	}
}

func New(clusterSvc clusterReader, opts ...Option) *Server {
	return newServer(clusterSvc, time.Now, slog.New(slog.NewJSONHandler(os.Stdout, nil)), opts...)
}

func newServer(clusterSvc clusterReader, now func() time.Time, logger *slog.Logger, opts ...Option) *Server {
	if now == nil {
		now = time.Now
	}
	if logger == nil {
		logger = slog.Default()
	}

	server := &Server{
		cluster: clusterSvc,
		now:     now,
		logger:  logger,
		metrics: newRequestMetrics(now),
		aiTTL:   8 * time.Second,
	}

	for _, opt := range opts {
		opt(server)
	}

	return server
}

func (s *Server) Router(distDir string) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(s.metrics.middleware(s.logger))
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(20 * time.Second))

	r.Route("/api", func(api chi.Router) {
		api.Get("/cluster-info", s.handleClusterInfo)
		api.Get("/metrics", s.handleMetrics)
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
		api.Post("/assistant", s.handleAssistant)
		api.Post("/terminal/exec", s.handleTerminalExec)
	})

	attachStatic(r, distDir)
	return r
}
