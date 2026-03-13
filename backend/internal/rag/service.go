package rag

import (
	"log/slog"
	"net/http"
	"regexp"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/sync/singleflight"
)

const (
	defaultRefreshInterval = 6 * time.Hour
	defaultHTTPTimeout     = 8 * time.Second
	defaultMaxBodyBytes    = int64(1 << 20) // 1MB
	defaultResultLimit     = 3
	maxResultLimit         = 8
	defaultChunkSize       = 900
	defaultChunkOverlap    = 140
	defaultOllamaBaseURL   = "http://localhost:11434"
	defaultEmbeddingModel  = "nomic-embed-text"
	minNormalizedLineLen   = 12
	defaultTraceLimit      = 24
	maxTraceLimit          = 80
	maxFeedbackTermScore   = int32(50)
)

var (
	tokenPattern      = regexp.MustCompile(`[a-z0-9][a-z0-9\-./_]{1,}`)
	scriptTagPattern  = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	styleTagPattern   = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	headingTagPattern = regexp.MustCompile(`(?i)</?(h[1-6]|p|li|tr|td|th|br|section|article|div|main|pre|code)[^>]*>`)
	anyTagPattern     = regexp.MustCompile(`(?is)<[^>]+>`)
	spacePattern      = regexp.MustCompile(`\s+`)
	stopWords         = map[string]struct{}{
		"the": {}, "and": {}, "for": {}, "that": {}, "with": {}, "from": {}, "this": {}, "your": {},
		"are": {}, "was": {}, "were": {}, "have": {}, "has": {}, "had": {}, "not": {}, "you": {}, "but": {},
		"can": {}, "will": {}, "all": {}, "its": {}, "into": {}, "out": {}, "how": {}, "why": {}, "what": {},
		"when": {}, "where": {}, "show": {}, "help": {}, "use": {}, "using": {}, "about": {}, "then": {},
		"kubernetes": {}, "cluster": {}, "issue": {}, "issues": {}, "please": {}, "need": {}, "check": {},
	}
	queryExpansions = map[string][]string{
		"oom":              {"oomkilled", "memory", "limit"},
		"oomkilled":        {"oom", "memory", "limit"},
		"crashloop":        {"crashloopbackoff", "restart", "probe"},
		"crashloopbackoff": {"crashloop", "restart", "probe"},
		"imagepullbackoff": {"image", "pull", "registry", "secret", "tag"},
		"imagepull":        {"imagepullbackoff", "registry", "secret"},
		"pending":          {"scheduling", "unschedulable", "quota", "taint", "affinity"},
		"unschedulable":    {"pending", "scheduling", "taint", "affinity"},
		"notready":         {"node", "pressure", "kubelet"},
		"evicted":          {"pressure", "node", "eviction"},
		"probe":            {"liveness", "readiness", "startup"},
		"forbidden":        {"rbac", "permission", "serviceaccount"},
	}
	sourceRoutingHints = map[string][]string{
		"oom":              {"manage-resources-containers", "memory", "resources"},
		"oomkilled":        {"manage-resources-containers", "memory", "resources"},
		"crashloop":        {"debug-running-pod", "debug-application", "probes"},
		"crashloopbackoff": {"debug-running-pod", "debug-application", "probes"},
		"imagepullbackoff": {"containers/images", "images", "registry"},
		"imagepull":        {"containers/images", "images", "registry"},
		"pending":          {"assign-pod-node", "taint-and-toleration", "resource-quotas", "scheduling-eviction"},
		"unschedulable":    {"assign-pod-node", "taint-and-toleration", "resource-quotas", "scheduling-eviction"},
		"notready":         {"node-pressure-eviction", "debug-cluster", "monitor-node-health"},
		"evicted":          {"node-pressure-eviction", "scheduling-eviction"},
		"probe":            {"liveness-readiness-startup-probes", "probes"},
		"forbidden":        {"rbac", "service-accounts", "authn-authz"},
		"rbac":             {"rbac", "service-accounts", "authn-authz"},
		"networkpolicy":    {"network-policies", "services-networking"},
		"dns":              {"dns-pod-service", "services-networking"},
		"ingress":          {"ingress", "services-networking"},
		"service":          {"service/", "services-networking"},
		"pvc":              {"persistent-volumes", "storage"},
		"pv":               {"persistent-volumes", "storage"},
		"storage":          {"persistent-volumes", "storage"},
	}
)

type SourceDoc struct {
	Source   string
	Title    string
	URL      string
	Fallback string
}

type Config struct {
	Enabled         bool
	Sources         []SourceDoc
	RefreshInterval time.Duration
	HTTPTimeout     time.Duration
	MaxBodyBytes    int64
	EmbeddingClient *EmbeddingClient
	Logger          *slog.Logger
}

type Service struct {
	enabled         bool
	sources         []SourceDoc
	refreshInterval time.Duration
	maxBodyBytes    int64
	client          *http.Client
	logger          *slog.Logger
	now             func() time.Time
	embeddingClient *EmbeddingClient

	mu         sync.RWMutex
	chunks     []chunk
	embeddings [][]float32
	tokenIdx   map[string][]int
	expiresAt  time.Time
	indexedAt  time.Time
	staleWarn  time.Time
	group      singleflight.Group

	queryTotal   atomic.Uint64
	emptyTotal   atomic.Uint64
	resultTotal  atomic.Uint64
	feedbackAll  atomic.Uint64
	feedbackUp   atomic.Uint64
	feedbackDown atomic.Uint64

	traceLimit int

	feedbackMu sync.RWMutex
	feedback   map[string]*docFeedback
	traces     []retrievalTrace
}

type chunk struct {
	source    string
	title     string
	url       string
	text      string
	textLower string
	tokenSet  map[string]struct{}
}

type retrievalQuery struct {
	rawLower      string
	terms         []string
	expandedTerms []string
}

type docFeedback struct {
	helpful    uint64
	notHelpful uint64
	termScores map[string]int32
	updatedAt  time.Time
}

type retrievalTrace struct {
	timestamp      time.Time
	query          string
	queryTerms     []string
	usedSemantic   bool
	candidateCount int
	resultCount    int
	duration       time.Duration
	results        []retrievalTraceResult
}

type retrievalTraceResult struct {
	title         string
	url           string
	source        string
	final         float64
	lexical       float64
	semantic      float64
	coverage      float64
	sourceBoost   float64
	feedbackBoost float64
}

func NewService(cfg Config) *Service {
	interval := cfg.RefreshInterval
	if interval <= 0 {
		interval = defaultRefreshInterval
	}

	timeout := cfg.HTTPTimeout
	if timeout <= 0 {
		timeout = defaultHTTPTimeout
	}

	maxBody := cfg.MaxBodyBytes
	if maxBody <= 0 {
		maxBody = defaultMaxBodyBytes
	}

	logger := cfg.Logger
	if logger == nil {
		logger = slog.Default()
	}

	sources := cfg.Sources
	if len(sources) == 0 {
		sources = defaultSources()
	}

	return &Service{
		enabled:         cfg.Enabled,
		sources:         append([]SourceDoc(nil), sources...),
		refreshInterval: interval,
		maxBodyBytes:    maxBody,
		client:          &http.Client{Timeout: timeout},
		logger:          logger,
		now:             time.Now,
		embeddingClient: cfg.EmbeddingClient,
		traceLimit:      defaultTraceLimit,
		feedback:        make(map[string]*docFeedback, 16),
	}
}

func (s *Service) Enabled() bool {
	return s != nil && s.enabled
}
