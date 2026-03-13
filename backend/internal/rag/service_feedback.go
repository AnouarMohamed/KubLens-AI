package rag

import (
	"strings"
	"time"

	"kubelens-backend/internal/model"
)

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
