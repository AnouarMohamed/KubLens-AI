package rag

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	htmlpkg "html"
	"io"
	"log/slog"
	"math"
	"net/http"
	"regexp"
	"slices"
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

func htmlToText(raw string) string {
	text := scriptTagPattern.ReplaceAllString(raw, " ")
	text = styleTagPattern.ReplaceAllString(text, " ")
	text = headingTagPattern.ReplaceAllString(text, "\n")
	text = anyTagPattern.ReplaceAllString(text, " ")
	text = htmlpkg.UnescapeString(text)
	return normalizeText(text)
}

func normalizeText(raw string) string {
	parts := strings.Split(raw, "\n")
	normalized := make([]string, 0, len(parts))
	for _, part := range parts {
		line := strings.TrimSpace(spacePattern.ReplaceAllString(part, " "))
		if len(line) < minNormalizedLineLen {
			continue
		}
		normalized = append(normalized, line)
	}
	return strings.Join(normalized, "\n")
}

func chunkText(text string, maxLen, overlap int) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}

	if maxLen <= 0 {
		maxLen = defaultChunkSize
	}
	if overlap < 0 {
		overlap = 0
	}

	lines := strings.Split(text, "\n")
	chunks := make([]string, 0, len(lines))
	var current strings.Builder

	flush := func() {
		block := strings.TrimSpace(current.String())
		if block != "" {
			chunks = append(chunks, block)
		}
		current.Reset()
	}

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if current.Len() > 0 && current.Len()+1+len(line) > maxLen {
			flush()
			if overlap > 0 && len(chunks) > 0 {
				tail := chunks[len(chunks)-1]
				if len(tail) > overlap {
					tail = tail[len(tail)-overlap:]
				}
				current.WriteString(strings.TrimSpace(tail))
				current.WriteByte(' ')
			}
		}
		if current.Len() > 0 {
			current.WriteByte(' ')
		}
		current.WriteString(line)
	}
	flush()

	return chunks
}

func tokenize(input string) []string {
	raw := tokenPattern.FindAllString(strings.ToLower(input), -1)
	tokens := make([]string, 0, len(raw))
	for _, token := range raw {
		if len(token) <= 2 {
			continue
		}
		if _, excluded := stopWords[token]; excluded {
			continue
		}
		tokens = append(tokens, token)
	}
	return tokens
}

func buildRetrievalQuery(query string) retrievalQuery {
	rawLower := strings.ToLower(strings.TrimSpace(query))
	terms := tokenize(rawLower)
	return retrievalQuery{
		rawLower:      rawLower,
		terms:         terms,
		expandedTerms: expandQueryTerms(terms),
	}
}

func expandQueryTerms(terms []string) []string {
	if len(terms) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(terms)*3)
	out := make([]string, 0, len(terms)*2)
	add := func(term string) {
		normalized := strings.TrimSpace(strings.ToLower(term))
		if len(normalized) <= 2 {
			return
		}
		if _, excluded := stopWords[normalized]; excluded {
			return
		}
		if _, exists := seen[normalized]; exists {
			return
		}
		seen[normalized] = struct{}{}
		out = append(out, normalized)
	}

	for _, term := range terms {
		add(term)
		if related, ok := queryExpansions[term]; ok {
			for _, expanded := range related {
				add(expanded)
			}
		}
		for _, separator := range []string{"-", "/", "_", "."} {
			if !strings.Contains(term, separator) {
				continue
			}
			for _, part := range strings.Split(term, separator) {
				add(part)
			}
		}
	}

	return out
}

func matchScore(item chunk, queryLower string, queryTerms, expandedTerms []string) float64 {
	if len(expandedTerms) == 0 {
		return 0
	}

	score := 0.0
	coverageHits := 0
	titleLower := strings.ToLower(strings.TrimSpace(item.title))
	for _, term := range queryTerms {
		if term == "" {
			continue
		}
		if _, matched := item.tokenSet[term]; matched {
			score += 4.0
			coverageHits++
		}
		if strings.Contains(titleLower, term) {
			score += 2.5
		}
		if strings.Contains(item.textLower, term) {
			score += 0.8
		}
	}

	for _, term := range expandedTerms {
		if slices.Contains(queryTerms, term) {
			continue
		}
		if _, matched := item.tokenSet[term]; matched {
			score += 1.5
		}
		if strings.Contains(titleLower, term) {
			score += 0.9
		}
	}

	if strings.Contains(item.textLower, queryLower) {
		score += 6.0
	}
	if len(queryTerms) > 0 && coverageHits > 0 {
		score += (float64(coverageHits) / float64(len(queryTerms))) * 4.0
	}

	return score
}

func queryCoverage(item chunk, queryTerms []string) float64 {
	if len(queryTerms) == 0 {
		return 0
	}
	hits := 0
	for _, term := range queryTerms {
		if _, ok := item.tokenSet[term]; ok {
			hits++
		}
	}
	return float64(hits) / float64(len(queryTerms))
}

func normalizeSemanticScore(score float64) float64 {
	normalized := (score + 1) / 2
	if normalized < 0 {
		return 0
	}
	if normalized > 1 {
		return 1
	}
	return normalized
}

func buildSourceRoutingHints(expandedTerms []string, rawLower string) []string {
	if len(expandedTerms) == 0 && strings.TrimSpace(rawLower) == "" {
		return nil
	}
	seen := make(map[string]struct{}, 12)
	out := make([]string, 0, 12)
	add := func(value string) {
		normalized := strings.ToLower(strings.TrimSpace(value))
		if normalized == "" {
			return
		}
		if _, exists := seen[normalized]; exists {
			return
		}
		seen[normalized] = struct{}{}
		out = append(out, normalized)
	}

	for _, term := range expandedTerms {
		if hints, ok := sourceRoutingHints[term]; ok {
			for _, hint := range hints {
				add(hint)
			}
		}
	}
	for term, hints := range sourceRoutingHints {
		if !strings.Contains(rawLower, term) {
			continue
		}
		for _, hint := range hints {
			add(hint)
		}
	}
	return out
}

func sourceRouteBoost(item chunk, hints []string) float64 {
	if len(hints) == 0 {
		return 0
	}
	haystack := strings.ToLower(item.title + " " + item.url)
	matches := 0
	for _, hint := range hints {
		if hint == "" {
			continue
		}
		if strings.Contains(haystack, hint) {
			matches++
		}
	}
	if matches == 0 {
		return 0
	}
	coverage := float64(matches) / float64(len(hints))
	if coverage > 1 {
		return 1
	}
	return coverage
}

func (s *Service) feedbackBoostForQuery(url string, queryTerms []string) float64 {
	s.feedbackMu.RLock()
	entry := s.feedback[strings.TrimSpace(url)]
	if entry == nil {
		s.feedbackMu.RUnlock()
		return 0
	}
	helpful := entry.helpful
	notHelpful := entry.notHelpful
	termScores := make(map[string]int32, len(entry.termScores))
	for term, score := range entry.termScores {
		termScores[term] = score
	}
	s.feedbackMu.RUnlock()

	total := float64(helpful + notHelpful)
	overall := 0.0
	if total > 0 {
		overall = float64(int64(helpful)-int64(notHelpful)) / (total + 3.0)
	}

	termSpecific := 0.0
	termHits := 0
	for _, term := range queryTerms {
		score, ok := termScores[term]
		if !ok {
			continue
		}
		termSpecific += float64(score) / float64(maxFeedbackTermScore)
		termHits++
	}
	if termHits > 0 {
		termSpecific /= float64(termHits)
	}

	boost := overall*0.7 + termSpecific*0.3
	if boost > 1 {
		return 1
	}
	if boost < -1 {
		return -1
	}
	return boost
}

func (s *Service) recordRetrieval(
	query string,
	queryTerms []string,
	usedSemantic bool,
	results []retrievalTraceResult,
	resultCount int,
	candidateCount int,
	started time.Time,
) {
	s.queryTotal.Add(1)
	if resultCount < 0 {
		resultCount = 0
	}
	s.resultTotal.Add(uint64(resultCount))
	if resultCount == 0 {
		s.emptyTotal.Add(1)
	}

	trace := retrievalTrace{
		timestamp:      s.now(),
		query:          truncateForTrace(query, 280),
		queryTerms:     append([]string(nil), queryTerms...),
		usedSemantic:   usedSemantic,
		candidateCount: candidateCount,
		resultCount:    resultCount,
		duration:       s.now().Sub(started),
		results:        append([]retrievalTraceResult(nil), results...),
	}

	s.feedbackMu.Lock()
	s.traces = append(s.traces, trace)
	limit := s.traceLimit
	if limit <= 0 {
		limit = defaultTraceLimit
	}
	if limit > maxTraceLimit {
		limit = maxTraceLimit
	}
	if overflow := len(s.traces) - limit; overflow > 0 {
		s.traces = append([]retrievalTrace(nil), s.traces[overflow:]...)
	}
	s.feedbackMu.Unlock()
}

func (s *Service) topFeedbackDocsLocked(limit int) []model.RAGDocFeedback {
	if limit <= 0 {
		return []model.RAGDocFeedback{}
	}
	type scoredDoc struct {
		url      string
		helpful  uint64
		negative uint64
		net      int64
		updated  time.Time
	}
	scored := make([]scoredDoc, 0, len(s.feedback))
	for url, entry := range s.feedback {
		net := int64(entry.helpful) - int64(entry.notHelpful)
		if entry.helpful == 0 && entry.notHelpful == 0 {
			continue
		}
		scored = append(scored, scoredDoc{
			url:      url,
			helpful:  entry.helpful,
			negative: entry.notHelpful,
			net:      net,
			updated:  entry.updatedAt,
		})
	}
	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].net == scored[j].net {
			if scored[i].helpful == scored[j].helpful {
				return scored[i].updated.After(scored[j].updated)
			}
			return scored[i].helpful > scored[j].helpful
		}
		return scored[i].net > scored[j].net
	})
	if len(scored) > limit {
		scored = scored[:limit]
	}
	out := make([]model.RAGDocFeedback, 0, len(scored))
	for _, item := range scored {
		updatedAt := ""
		if !item.updated.IsZero() {
			updatedAt = item.updated.UTC().Format(time.RFC3339)
		}
		out = append(out, model.RAGDocFeedback{
			URL:        item.url,
			Helpful:    item.helpful,
			NotHelpful: item.negative,
			NetScore:   item.net,
			UpdatedAt:  updatedAt,
		})
	}
	return out
}

func (s *Service) recentTracesLocked(limit int) []model.RAGQueryTrace {
	if limit <= 0 {
		return []model.RAGQueryTrace{}
	}
	if len(s.traces) == 0 {
		return []model.RAGQueryTrace{}
	}

	start := 0
	if len(s.traces) > limit {
		start = len(s.traces) - limit
	}
	selected := s.traces[start:]
	out := make([]model.RAGQueryTrace, 0, len(selected))
	for i := len(selected) - 1; i >= 0; i-- {
		trace := selected[i]
		top := make([]model.RAGResultTrace, 0, len(trace.results))
		for _, item := range trace.results {
			top = append(top, model.RAGResultTrace{
				Title:         item.title,
				URL:           item.url,
				Source:        item.source,
				FinalScore:    item.final,
				LexicalScore:  item.lexical,
				SemanticScore: item.semantic,
				CoverageScore: item.coverage,
				SourceBoost:   item.sourceBoost,
				FeedbackBoost: item.feedbackBoost,
			})
		}
		out = append(out, model.RAGQueryTrace{
			Timestamp:      trace.timestamp.UTC().Format(time.RFC3339),
			Query:          trace.query,
			QueryTerms:     append([]string(nil), trace.queryTerms...),
			UsedSemantic:   trace.usedSemantic,
			CandidateCount: trace.candidateCount,
			ResultCount:    trace.resultCount,
			DurationMs:     trace.duration.Seconds() * 1000,
			TopResults:     top,
		})
	}
	return out
}

func truncateForTrace(value string, maxLen int) string {
	trimmed := strings.TrimSpace(value)
	if maxLen <= 0 || len(trimmed) <= maxLen {
		return trimmed
	}
	return trimmed[:maxLen] + "..."
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func buildTokenIndex(chunks []chunk) map[string][]int {
	index := make(map[string][]int, len(chunks)*4)
	for i, item := range chunks {
		for token := range item.tokenSet {
			index[token] = append(index[token], i)
		}
	}
	return index
}

func candidateIndexes(queryTerms []string, tokenIdx map[string][]int, total int) []int {
	if total == 0 {
		return nil
	}
	if len(queryTerms) == 0 || len(tokenIdx) == 0 {
		return nil
	}

	seen := make(map[int]struct{}, len(queryTerms)*3)
	for _, term := range queryTerms {
		for _, idx := range tokenIdx[term] {
			seen[idx] = struct{}{}
		}
	}

	if len(seen) == 0 {
		// Returning nil triggers caller fallback to full-scan ranking.
		// This keeps recall high when query terms are absent from token index.
		return nil
	}

	out := make([]int, 0, len(seen))
	for idx := range seen {
		out = append(out, idx)
	}
	sort.Ints(out)
	return out
}

func bestSnippet(text string, queryTerms []string, maxLen int) string {
	if maxLen <= 0 {
		maxLen = 260
	}

	text = strings.TrimSpace(text)
	if len(text) <= maxLen {
		return text
	}

	lower := strings.ToLower(text)
	windowSize := maxLen
	if windowSize < 120 {
		windowSize = 120
	}
	step := windowSize / 2
	if step < 60 {
		step = 60
	}

	bestStart := 0
	bestHits := -1
	for start := 0; start < len(text); start += step {
		end := start + windowSize
		if end > len(text) {
			end = len(text)
		}
		segment := lower[start:end]
		hits := 0
		for _, term := range queryTerms {
			if term == "" {
				continue
			}
			if strings.Contains(segment, term) {
				hits++
			}
		}
		if hits > bestHits {
			bestHits = hits
			bestStart = start
		}
		if end == len(text) {
			break
		}
	}

	anchor := -1
	for _, term := range queryTerms {
		idx := strings.Index(lower, term)
		if idx >= 0 && (anchor == -1 || idx < anchor) {
			anchor = idx
		}
	}

	if bestHits <= 0 && anchor == -1 {
		return strings.TrimSpace(text[:maxLen]) + "..."
	}
	if anchor >= 0 {
		start := int(math.Max(0, float64(anchor-maxLen/3)))
		if bestHits <= 0 || absInt(start-bestStart) > maxLen {
			bestStart = start
		}
	}

	return trimSnippet(text, bestStart, maxLen)
}

func trimSnippet(text string, start, maxLen int) string {
	if start < 0 {
		start = 0
	}
	if start > len(text) {
		start = len(text)
	}
	end := start + maxLen
	if end > len(text) {
		end = len(text)
	}
	snippet := strings.TrimSpace(text[start:end])
	if start > 0 {
		snippet = "..." + snippet
	}
	if end < len(text) {
		snippet += "..."
	}
	return snippet
}

func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func defaultSources() []SourceDoc {
	return []SourceDoc{
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Pod lifecycle",
			URL:      "https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/",
			Fallback: "Pod phases include Pending, Running, Succeeded, Failed and Unknown. Pending often means scheduling or image pull issues. Failed means containers terminated and will not restart depending on restart policy.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Services",
			URL:      "https://kubernetes.io/docs/concepts/services-networking/service/",
			Fallback: "Services provide stable virtual IPs and DNS names for pod backends. Troubleshoot selectors, endpoints, and target ports when connectivity fails.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Ingress",
			URL:      "https://kubernetes.io/docs/concepts/services-networking/ingress/",
			Fallback: "Ingress routes HTTP/S traffic to services. Validate ingress class, host/path rules, TLS secrets, and controller health.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes NetworkPolicy",
			URL:      "https://kubernetes.io/docs/concepts/services-networking/network-policies/",
			Fallback: "NetworkPolicy controls pod ingress and egress. Deny-by-default behavior can block service communication if allow rules are incomplete.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes DNS",
			URL:      "https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/",
			Fallback: "Kubernetes DNS resolves service and pod names. Check CoreDNS health and namespace-qualified names when resolution fails.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Deployments",
			URL:      "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/",
			Fallback: "Deployments manage rollout and rollback of ReplicaSets. Analyze unavailable replicas, rollout status, and revision history for failures.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes StatefulSets",
			URL:      "https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/",
			Fallback: "StatefulSets provide stable identity and ordered rollout for stateful workloads. Storage, ordinals, and update strategy often drive failures.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes DaemonSets",
			URL:      "https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/",
			Fallback: "DaemonSets schedule one pod per node by selector. Taints, selectors, and node readiness determine daemon pod coverage.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Jobs",
			URL:      "https://kubernetes.io/docs/concepts/workloads/controllers/job/",
			Fallback: "Jobs run finite workloads to completion. Backoff limits, pod failures, and parallelism settings affect completion behavior.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes HPA",
			URL:      "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/",
			Fallback: "HPA scales workloads from metrics. Missing metrics, incorrect target values, or unavailable metrics-server cause scaling issues.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Node Affinity",
			URL:      "https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/",
			Fallback: "Node affinity and selectors constrain pod placement. Unsatisfiable constraints produce Pending pods with scheduling failures.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Taints and Tolerations",
			URL:      "https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/",
			Fallback: "Taints repel pods without matching tolerations. Scheduling and eviction issues can stem from taints not accounted for in workload specs.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Resource Quotas",
			URL:      "https://kubernetes.io/docs/concepts/policy/resource-quotas/",
			Fallback: "ResourceQuotas cap namespace resource usage. Pod creation or scaling can fail when quotas are reached.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Pod Priority",
			URL:      "https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/",
			Fallback: "Priority classes influence scheduling and preemption. Lower-priority pods may be evicted when higher-priority workloads arrive.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Persistent Volumes",
			URL:      "https://kubernetes.io/docs/concepts/storage/persistent-volumes/",
			Fallback: "PersistentVolumes and claims back stateful storage. Binding, access modes, and storage class mismatches are common causes of mount failures.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes ConfigMaps",
			URL:      "https://kubernetes.io/docs/concepts/configuration/configmap/",
			Fallback: "ConfigMaps inject non-secret config into pods. Invalid keys or stale mounts can break startup configuration.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Secrets",
			URL:      "https://kubernetes.io/docs/concepts/configuration/secret/",
			Fallback: "Secrets store sensitive data for workloads. Missing secrets or key mismatches commonly cause startup and auth failures.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes RBAC",
			URL:      "https://kubernetes.io/docs/reference/access-authn-authz/rbac/",
			Fallback: "RBAC roles and bindings control API access. Forbidden errors indicate missing permissions or wrong service accounts.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Security Contexts",
			URL:      "https://kubernetes.io/docs/tasks/configure-pod-container/security-context/",
			Fallback: "SecurityContext configures UID/GID, capabilities, and file permissions. Misconfiguration can block process startup or volume access.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Service Accounts",
			URL:      "https://kubernetes.io/docs/concepts/security/service-accounts/",
			Fallback: "Service accounts provide pod identity for API access. Missing bindings can cause in-cluster auth and permission failures.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Troubleshoot Clusters",
			URL:      "https://kubernetes.io/docs/tasks/debug/debug-cluster/",
			Fallback: "Cluster troubleshooting starts with node status, component health, and warning events. Verify control plane and networking first.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Troubleshoot Applications",
			URL:      "https://kubernetes.io/docs/tasks/debug/debug-application/",
			Fallback: "Application troubleshooting focuses on events, logs, probes, and configuration drift across pods and deployments.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes CrashLoopBackOff",
			URL:      "https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/",
			Fallback: "CrashLoopBackOff means repeated container crashes. Inspect termination reason, startup command, env, and dependencies.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes OOMKilled",
			URL:      "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/",
			Fallback: "OOMKilled indicates container memory exceeded limit. Adjust limits/requests and investigate memory growth or leaks.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes ImagePullBackOff",
			URL:      "https://kubernetes.io/docs/concepts/containers/images/",
			Fallback: "ImagePullBackOff typically means auth issues, wrong image name/tag, registry outages, or network restrictions.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Node Pressure",
			URL:      "https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/",
			Fallback: "Node pressure triggers evictions for memory, disk, or PID shortages. Check eviction signals and kubelet thresholds.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Node Problem Detector",
			URL:      "https://kubernetes.io/docs/tasks/debug/debug-cluster/monitor-node-health/",
			Fallback: "Node Problem Detector surfaces kernel and system-level node faults that impact scheduling and workload stability.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes Probes",
			URL:      "https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/",
			Fallback: "Probe misconfiguration causes false restarts and traffic drops. Validate probe path, port, timing, and thresholds.",
		},
	}
}

type EmbeddingClient struct {
	baseURL string
	model   string
	client  *http.Client
}

func NewEmbeddingClient(baseURL, model string, httpClient *http.Client) (*EmbeddingClient, error) {
	trimmedBaseURL := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if trimmedBaseURL == "" {
		trimmedBaseURL = defaultOllamaBaseURL
	}
	trimmedModel := strings.TrimSpace(model)
	if trimmedModel == "" {
		trimmedModel = defaultEmbeddingModel
	}
	client := httpClient
	if client == nil {
		client = &http.Client{Timeout: defaultHTTPTimeout}
	}
	return &EmbeddingClient{
		baseURL: trimmedBaseURL,
		model:   trimmedModel,
		client:  client,
	}, nil
}

func (c *EmbeddingClient) Embed(ctx context.Context, text string) ([]float32, error) {
	payload, err := json.Marshal(map[string]any{
		"model":  c.model,
		"prompt": text,
	})
	if err != nil {
		return nil, fmt.Errorf("encode embedding request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/api/embeddings", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("build embedding request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request embeddings: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		payload, _ := io.ReadAll(io.LimitReader(resp.Body, 16<<10))
		return nil, fmt.Errorf("embedding status %d: %s", resp.StatusCode, strings.TrimSpace(string(payload)))
	}

	var out struct {
		Embedding []float64 `json:"embedding"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decode embeddings: %w", err)
	}
	if len(out.Embedding) == 0 {
		return nil, errors.New("empty embeddings response")
	}

	vector := make([]float32, len(out.Embedding))
	for i, value := range out.Embedding {
		vector[i] = float32(value)
	}
	return vector, nil
}

func cosineSimilarity(a []float32, b []float32) float32 {
	if len(a) == 0 || len(b) == 0 || len(a) != len(b) {
		return 0
	}
	var dot float32
	var sumA float32
	var sumB float32
	for i := range a {
		dot += a[i] * b[i]
		sumA += a[i] * a[i]
		sumB += b[i] * b[i]
	}
	denom := float32(math.Sqrt(float64(sumA))) * float32(math.Sqrt(float64(sumB)))
	if denom == 0 {
		return 0
	}
	return dot / denom
}
