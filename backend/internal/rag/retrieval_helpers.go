package rag

import (
	"math"
	"slices"
	"sort"
	"strings"

	htmlpkg "html"
)

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
