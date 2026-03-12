package rag

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/sync/singleflight"

	"kubelens-backend/internal/model"
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

func (s *Service) RecordFeedback(query, url string, helpful bool) bool {
	if s == nil || !s.Enabled() {
		return false
	}

	normalizedURL := strings.TrimSpace(url)
	if normalizedURL == "" {
		return false
	}

	terms := expandQueryTerms(tokenize(strings.ToLower(strings.TrimSpace(query))))
	now := s.now()

	s.feedbackMu.Lock()
	entry, exists := s.feedback[normalizedURL]
	if !exists {
		entry = &docFeedback{
			termScores: make(map[string]int32, len(terms)),
		}
		s.feedback[normalizedURL] = entry
	}
	if entry.termScores == nil {
		entry.termScores = make(map[string]int32, len(terms))
	}
	if helpful {
		entry.helpful++
	} else {
		entry.notHelpful++
	}
	for _, term := range terms {
		if term == "" {
			continue
		}
		current := entry.termScores[term]
		if helpful {
			if current < maxFeedbackTermScore {
				current++
			}
		} else {
			if current > -maxFeedbackTermScore {
				current--
			}
		}
		entry.termScores[term] = current
	}
	entry.updatedAt = now
	s.feedbackMu.Unlock()

	s.feedbackAll.Add(1)
	if helpful {
		s.feedbackUp.Add(1)
	} else {
		s.feedbackDown.Add(1)
	}
	return true
}

func (s *Service) TelemetrySnapshot(limit int) model.RAGTelemetry {
	if s == nil {
		return model.RAGTelemetry{
			TopFeedbackDocs: []model.RAGDocFeedback{},
			RecentQueries:   []model.RAGQueryTrace{},
		}
	}
	if limit <= 0 {
		limit = defaultTraceLimit
	}
	if limit > maxTraceLimit {
		limit = maxTraceLimit
	}

	_, _, _, expiresAt, indexedAt := s.snapshotIndex()

	totalQueries := s.queryTotal.Load()
	emptyResults := s.emptyTotal.Load()
	resultTotal := s.resultTotal.Load()
	feedbackAll := s.feedbackAll.Load()
	feedbackUp := s.feedbackUp.Load()
	feedbackDown := s.feedbackDown.Load()

	hitRate := 0.0
	averageResults := 0.0
	if totalQueries > 0 {
		hitRate = float64(totalQueries-emptyResults) / float64(totalQueries)
		averageResults = float64(resultTotal) / float64(totalQueries)
	}

	s.feedbackMu.RLock()
	topDocs := s.topFeedbackDocsLocked(10)
	recent := s.recentTracesLocked(limit)
	s.feedbackMu.RUnlock()

	indexedAtText := ""
	if !indexedAt.IsZero() {
		indexedAtText = indexedAt.UTC().Format(time.RFC3339)
	}
	expiresAtText := ""
	if !expiresAt.IsZero() {
		expiresAtText = expiresAt.UTC().Format(time.RFC3339)
	}

	return model.RAGTelemetry{
		Enabled:          s.Enabled(),
		IndexedAt:        indexedAtText,
		ExpiresAt:        expiresAtText,
		TotalQueries:     totalQueries,
		EmptyResults:     emptyResults,
		HitRate:          hitRate,
		AverageResults:   averageResults,
		FeedbackSignals:  feedbackAll,
		PositiveFeedback: feedbackUp,
		NegativeFeedback: feedbackDown,
		TopFeedbackDocs:  topDocs,
		RecentQueries:    recent,
	}
}

func (s *Service) Retrieve(ctx context.Context, query string, limit int) []model.DocumentationReference {
	if !s.Enabled() {
		return nil
	}

	started := s.now()
	query = strings.TrimSpace(query)
	if query == "" {
		return nil
	}

	if limit <= 0 {
		limit = defaultResultLimit
	}
	if limit > maxResultLimit {
		limit = maxResultLimit
	}

	s.ensureLoaded(ctx)

	chunks, embeddings, tokenIdx, expiresAt, indexedAt := s.snapshotIndex()
	if len(chunks) == 0 {
		s.recordRetrieval(query, nil, false, nil, 0, 0, started)
		return nil
	}
	s.warnIfStaleIndex(expiresAt, indexedAt)

	parsed := buildRetrievalQuery(query)
	if len(parsed.expandedTerms) == 0 {
		s.recordRetrieval(query, parsed.terms, false, nil, 0, 0, started)
		return nil
	}

	candidates := candidateIndexes(parsed.expandedTerms, tokenIdx, len(chunks))
	if len(candidates) == 0 {
		candidates = make([]int, len(chunks))
		for i := range chunks {
			candidates[i] = i
		}
	}

	sourceHints := buildSourceRoutingHints(parsed.expandedTerms, parsed.rawLower)

	lexicalScores := make(map[int]float64, len(candidates))
	maxLexical := 0.0
	for _, index := range candidates {
		score := matchScore(chunks[index], parsed.rawLower, parsed.terms, parsed.expandedTerms)
		if score <= 0 {
			continue
		}
		lexicalScores[index] = score
		if score > maxLexical {
			maxLexical = score
		}
	}

	semanticScores, hasSemantic := s.semanticScores(ctx, query, candidates, embeddings)

	combinedIndexes := make(map[int]struct{}, len(lexicalScores)+len(semanticScores))
	for index := range lexicalScores {
		combinedIndexes[index] = struct{}{}
	}
	for index := range semanticScores {
		combinedIndexes[index] = struct{}{}
	}
	if len(combinedIndexes) == 0 {
		s.recordRetrieval(query, parsed.terms, hasSemantic, nil, 0, len(candidates), started)
		return nil
	}

	type scored struct {
		index         int
		total         float64
		lexicalNorm   float64
		semanticNorm  float64
		queryCoverage float64
		sourceBoost   float64
		feedbackBoost float64
	}

	ranked := make([]scored, 0, len(combinedIndexes))
	for index := range combinedIndexes {
		chunk := chunks[index]
		lexical := lexicalScores[index]
		lexicalNorm := 0.0
		if maxLexical > 0 {
			lexicalNorm = lexical / maxLexical
		}

		semanticNorm := 0.0
		if hasSemantic {
			semanticNorm = normalizeSemanticScore(semanticScores[index])
		}

		coverage := queryCoverage(chunk, parsed.terms)
		sourceBoost := sourceRouteBoost(chunk, sourceHints)
		feedbackBoost := s.feedbackBoostForQuery(chunk.url, parsed.expandedTerms)
		total := lexicalNorm*0.58 + semanticNorm*0.22 + coverage*0.05 + sourceBoost*0.10 + feedbackBoost*0.05

		if len(parsed.terms) > 0 && lexical <= 0 {
			if !hasSemantic || semanticNorm < 0.62 {
				continue
			}
			total *= 0.88
		}
		if total <= 0 {
			continue
		}
		ranked = append(ranked, scored{
			index:         index,
			total:         total,
			lexicalNorm:   lexicalNorm,
			semanticNorm:  semanticNorm,
			queryCoverage: coverage,
			sourceBoost:   sourceBoost,
			feedbackBoost: feedbackBoost,
		})
	}
	if len(ranked) == 0 {
		s.recordRetrieval(query, parsed.terms, hasSemantic, nil, 0, len(candidates), started)
		return nil
	}

	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].total == ranked[j].total {
			if ranked[i].lexicalNorm == ranked[j].lexicalNorm {
				if ranked[i].semanticNorm == ranked[j].semanticNorm {
					left := chunks[ranked[i].index]
					right := chunks[ranked[j].index]
					return left.title < right.title
				}
				return ranked[i].semanticNorm > ranked[j].semanticNorm
			}
			return ranked[i].lexicalNorm > ranked[j].lexicalNorm
		}
		return ranked[i].total > ranked[j].total
	})

	refs := make([]model.DocumentationReference, 0, limit)
	traceResults := make([]retrievalTraceResult, 0, minInt(len(ranked), 5))
	seenURL := map[string]struct{}{}
	for _, item := range ranked {
		if len(refs) >= limit {
			break
		}
		chunk := chunks[item.index]
		if _, exists := seenURL[chunk.url]; exists {
			continue
		}
		seenURL[chunk.url] = struct{}{}
		snippetTerms := parsed.terms
		if len(snippetTerms) == 0 {
			snippetTerms = parsed.expandedTerms
		}
		refs = append(refs, model.DocumentationReference{
			Title:   chunk.title,
			URL:     chunk.url,
			Source:  chunk.source,
			Snippet: bestSnippet(chunk.text, snippetTerms, 260),
		})
		if len(traceResults) < cap(traceResults) {
			traceResults = append(traceResults, retrievalTraceResult{
				title:         chunk.title,
				url:           chunk.url,
				source:        chunk.source,
				final:         item.total,
				lexical:       item.lexicalNorm,
				semantic:      item.semanticNorm,
				coverage:      item.queryCoverage,
				sourceBoost:   item.sourceBoost,
				feedbackBoost: item.feedbackBoost,
			})
		}
	}

	s.recordRetrieval(query, parsed.terms, hasSemantic, traceResults, len(refs), len(candidates), started)
	return refs
}

func (s *Service) ensureLoaded(ctx context.Context) {
	if s.hasFreshIndex() {
		return
	}

	_, err, _ := s.group.Do("refresh", func() (any, error) {
		if s.hasFreshIndex() {
			return nil, nil
		}

		chunks, embeddings := s.buildIndex(ctx)
		if len(chunks) == 0 {
			chunks, embeddings = s.fallbackIndex()
		}
		if len(chunks) == 0 {
			return nil, nil
		}

		s.mu.Lock()
		s.chunks = chunks
		s.embeddings = embeddings
		s.tokenIdx = buildTokenIndex(chunks)
		s.expiresAt = s.now().Add(s.refreshInterval)
		s.indexedAt = s.now()
		s.staleWarn = time.Time{}
		s.mu.Unlock()
		return nil, nil
	})
	if err != nil && s.logger != nil {
		s.logger.Warn("rag refresh failed", "error", err.Error())
	}
}

func (s *Service) hasFreshIndex() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.chunks) > 0 && s.now().Before(s.expiresAt)
}

func (s *Service) snapshotIndex() ([]chunk, [][]float32, map[string][]int, time.Time, time.Time) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.chunks, s.embeddings, s.tokenIdx, s.expiresAt, s.indexedAt
}

func (s *Service) warnIfStaleIndex(expiresAt, indexedAt time.Time) {
	if expiresAt.IsZero() || s.logger == nil {
		return
	}
	now := s.now()
	if now.Before(expiresAt) {
		return
	}

	s.mu.Lock()
	if !s.staleWarn.IsZero() && now.Sub(s.staleWarn) < 5*time.Minute {
		s.mu.Unlock()
		return
	}
	s.staleWarn = now
	s.mu.Unlock()

	age := "unknown"
	if !indexedAt.IsZero() {
		age = now.Sub(indexedAt).Round(time.Second).String()
	}
	s.logger.Warn("rag index is stale; serving potentially outdated references",
		"indexed_at", indexedAt,
		"expires_at", expiresAt,
		"index_age", age,
	)
}

func (s *Service) buildIndex(ctx context.Context) ([]chunk, [][]float32) {
	results := make([][]chunk, len(s.sources))
	var wg sync.WaitGroup
	wg.Add(len(s.sources))
	for i := range s.sources {
		i := i
		source := s.sources[i]
		go func() {
			defer wg.Done()

			text, err := s.fetchSourceText(ctx, source)
			if err != nil {
				if s.logger != nil {
					s.logger.Warn("rag source fetch failed", "source", source.Source, "url", source.URL, "error", err.Error())
				}
				text = source.Fallback
			}

			chunks := make([]chunk, 0, 3)
			for _, part := range chunkText(text, defaultChunkSize, defaultChunkOverlap) {
				item := newChunk(source, part)
				if item.text == "" {
					continue
				}
				chunks = append(chunks, item)
			}
			results[i] = chunks
		}()
	}
	wg.Wait()

	out := make([]chunk, 0, len(s.sources)*3)
	for _, chunks := range results {
		out = append(out, chunks...)
	}

	return out, s.buildEmbeddings(ctx, out)
}

func (s *Service) fallbackIndex() ([]chunk, [][]float32) {
	out := make([]chunk, 0, len(s.sources))
	for _, source := range s.sources {
		for _, part := range chunkText(source.Fallback, defaultChunkSize, defaultChunkOverlap) {
			item := newChunk(source, part)
			if item.text == "" {
				continue
			}
			out = append(out, item)
		}
	}
	return out, s.buildEmbeddings(context.Background(), out)
}

func newChunk(source SourceDoc, raw string) chunk {
	text := strings.TrimSpace(spacePattern.ReplaceAllString(raw, " "))
	if text == "" {
		return chunk{}
	}
	lower := strings.ToLower(text)
	terms := tokenize(lower)
	tokenSet := make(map[string]struct{}, len(terms))
	for _, token := range terms {
		tokenSet[token] = struct{}{}
	}
	return chunk{
		source:    source.Source,
		title:     source.Title,
		url:       source.URL,
		text:      text,
		textLower: lower,
		tokenSet:  tokenSet,
	}
}

func (s *Service) buildEmbeddings(ctx context.Context, chunks []chunk) [][]float32 {
	if s.embeddingClient == nil || len(chunks) == 0 {
		return nil
	}

	embeddings := make([][]float32, len(chunks))
	for i := range chunks {
		vector, err := s.embeddingClient.Embed(ctx, chunks[i].text)
		if err != nil {
			if s.logger != nil {
				s.logger.Warn("rag embeddings failed", "error", err.Error())
			}
			return nil
		}
		embeddings[i] = vector
	}
	return embeddings
}

func (s *Service) semanticScores(
	ctx context.Context,
	query string,
	candidates []int,
	embeddings [][]float32,
) (map[int]float64, bool) {
	if s.embeddingClient == nil || len(candidates) == 0 || len(embeddings) == 0 {
		return nil, false
	}

	queryEmbedding, err := s.embeddingClient.Embed(ctx, query)
	if err != nil {
		if s.logger != nil {
			s.logger.Warn("rag query embedding failed", "error", err.Error())
		}
		return nil, false
	}
	if len(queryEmbedding) == 0 {
		return nil, false
	}

	scores := make(map[int]float64, len(candidates))
	for _, index := range candidates {
		if index < 0 || index >= len(embeddings) {
			continue
		}
		vector := embeddings[index]
		if len(vector) == 0 || len(vector) != len(queryEmbedding) {
			continue
		}
		score := cosineSimilarity(queryEmbedding, vector)
		scores[index] = float64(score)
	}
	if len(scores) == 0 {
		return nil, false
	}
	return scores, true
}

func (s *Service) fetchSourceText(ctx context.Context, source SourceDoc) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source.URL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "KubeLens-RAG/1.0")

	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("unexpected status code %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, s.maxBodyBytes))
	if err != nil {
		return "", err
	}

	contentType := strings.ToLower(resp.Header.Get("Content-Type"))
	text := string(body)
	if strings.Contains(contentType, "html") || strings.Contains(text, "<html") {
		return htmlToText(text), nil
	}
	return normalizeText(text), nil
}
