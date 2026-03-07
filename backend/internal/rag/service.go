package rag

import (
	"context"
	htmlpkg "html"
	"io"
	"log/slog"
	"math"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
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

	mu        sync.RWMutex
	chunks    []chunk
	tokenIdx  map[string][]int
	expiresAt time.Time
	group     singleflight.Group
}

type chunk struct {
	source    string
	title     string
	url       string
	text      string
	textLower string
	tokenSet  map[string]struct{}
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
	}
}

func (s *Service) Enabled() bool {
	return s != nil && s.enabled
}

func (s *Service) Retrieve(ctx context.Context, query string, limit int) []model.DocumentationReference {
	if !s.Enabled() {
		return nil
	}

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

	chunks, tokenIdx := s.snapshotIndex()
	if len(chunks) == 0 {
		return nil
	}

	queryTerms := tokenize(query)
	queryLower := strings.ToLower(query)
	candidates := candidateIndexes(queryTerms, tokenIdx, len(chunks))
	if len(candidates) == 0 {
		candidates = make([]int, len(chunks))
		for i := range chunks {
			candidates[i] = i
		}
	}

	type scored struct {
		chunk chunk
		score float64
	}

	ranked := make([]scored, 0, len(candidates))
	for _, index := range candidates {
		item := chunks[index]
		score := matchScore(item, queryLower, queryTerms)
		if score <= 0 {
			continue
		}
		ranked = append(ranked, scored{chunk: item, score: score})
	}

	sort.SliceStable(ranked, func(i, j int) bool {
		if ranked[i].score == ranked[j].score {
			return ranked[i].chunk.title < ranked[j].chunk.title
		}
		return ranked[i].score > ranked[j].score
	})

	refs := make([]model.DocumentationReference, 0, limit)
	seenURL := map[string]struct{}{}
	for _, item := range ranked {
		if len(refs) >= limit {
			break
		}
		if _, exists := seenURL[item.chunk.url]; exists {
			continue
		}
		seenURL[item.chunk.url] = struct{}{}
		refs = append(refs, model.DocumentationReference{
			Title:   item.chunk.title,
			URL:     item.chunk.url,
			Source:  item.chunk.source,
			Snippet: bestSnippet(item.chunk.text, queryTerms, 260),
		})
	}

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

		chunks := s.buildIndex(ctx)
		if len(chunks) == 0 {
			chunks = s.fallbackIndex()
		}
		if len(chunks) == 0 {
			return nil, nil
		}

		s.mu.Lock()
		s.chunks = chunks
		s.tokenIdx = buildTokenIndex(chunks)
		s.expiresAt = s.now().Add(s.refreshInterval)
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

func (s *Service) snapshotIndex() ([]chunk, map[string][]int) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.chunks, s.tokenIdx
}

func (s *Service) buildIndex(ctx context.Context) []chunk {
	out := make([]chunk, 0, len(s.sources)*3)

	for _, source := range s.sources {
		text, err := s.fetchSourceText(ctx, source)
		if err != nil {
			if s.logger != nil {
				s.logger.Warn("rag source fetch failed", "source", source.Source, "url", source.URL, "error", err.Error())
			}
			text = source.Fallback
		}

		for _, part := range chunkText(text, defaultChunkSize, defaultChunkOverlap) {
			item := newChunk(source, part)
			if item.text == "" {
				continue
			}
			out = append(out, item)
		}
	}

	return out
}

func (s *Service) fallbackIndex() []chunk {
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
	return out
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
		return "", io.ErrUnexpectedEOF
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
		if len(line) < 20 {
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

func matchScore(item chunk, queryLower string, queryTerms []string) float64 {
	if len(queryTerms) == 0 {
		return 0
	}

	score := 0.0
	titleLower := strings.ToLower(item.title)
	for _, term := range queryTerms {
		if _, ok := item.tokenSet[term]; ok {
			score += 3.0
		}
		if strings.Contains(titleLower, term) {
			score += 2.0
		}
		if strings.Contains(item.textLower, term) {
			score += 0.35
		}
	}

	if strings.Contains(item.textLower, queryLower) {
		score += 5.0
	}

	return score
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
	start := -1
	for _, term := range queryTerms {
		idx := strings.Index(lower, term)
		if idx >= 0 && (start == -1 || idx < start) {
			start = idx
		}
	}

	if start == -1 {
		return strings.TrimSpace(text[:maxLen]) + "..."
	}

	windowStart := int(math.Max(0, float64(start-maxLen/3)))
	windowEnd := windowStart + maxLen
	if windowEnd > len(text) {
		windowEnd = len(text)
	}
	snippet := strings.TrimSpace(text[windowStart:windowEnd])
	if windowStart > 0 {
		snippet = "..." + snippet
	}
	if windowEnd < len(text) {
		snippet += "..."
	}
	return snippet
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
			Title:    "Kubernetes debug running pods",
			URL:      "https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/",
			Fallback: "Use kubectl describe pod to inspect events, kubectl logs to inspect container output, and kubectl exec for runtime checks. Start debugging from events and probe failures.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes manage container resources",
			URL:      "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/",
			Fallback: "Set CPU and memory requests and limits carefully. OOMKilled indicates memory pressure and limit breaches. Throttling can happen with low CPU limits.",
		},
		{
			Source:   "kubernetes",
			Title:    "Kubernetes probes",
			URL:      "https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/",
			Fallback: "Liveness probes restart unhealthy containers, readiness probes control traffic routing, startup probes protect slow-start applications. Misconfigured probes can cause restart loops.",
		},
		{
			Source:   "docker",
			Title:    "Docker daemon troubleshooting",
			URL:      "https://docs.docker.com/engine/daemon/troubleshoot/",
			Fallback: "For Docker daemon issues, inspect daemon logs and service status, validate storage and permissions, and verify networking and DNS configuration.",
		},
		{
			Source:   "docker",
			Title:    "Docker container resource constraints",
			URL:      "https://docs.docker.com/engine/containers/resource_constraints/",
			Fallback: "Docker supports memory and CPU constraints. Memory limits can trigger OOM kills. CPU quotas and shares affect scheduling fairness and performance.",
		},
	}
}
