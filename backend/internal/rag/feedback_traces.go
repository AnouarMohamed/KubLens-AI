package rag

import (
	"sort"
	"strings"
	"time"

	"kubelens-backend/internal/model"
)

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
