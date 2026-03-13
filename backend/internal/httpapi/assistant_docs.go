package httpapi

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"kubelens-backend/internal/ai"
	"kubelens-backend/internal/model"
)

func (s *Server) retrieveDocReferences(ctx context.Context, message, diagnosticsSummary string) []model.DocumentationReference {
	if s.docs == nil || !s.docs.Enabled() {
		return nil
	}

	queries := buildDocsQueries(message, diagnosticsSummary)
	if len(queries) == 0 {
		queries = []string{"kubernetes troubleshooting"}
	}

	const refLimit = 3
	seen := make(map[string]struct{}, refLimit*2)
	refs := make([]model.DocumentationReference, 0, refLimit)

	for _, query := range queries {
		candidates := s.docs.Retrieve(ctx, query, refLimit)
		for _, candidate := range candidates {
			url := strings.TrimSpace(candidate.URL)
			if url == "" {
				continue
			}
			if _, exists := seen[url]; exists {
				continue
			}
			seen[url] = struct{}{}
			refs = append(refs, candidate)
			if len(refs) >= refLimit {
				return refs
			}
		}
	}

	if len(refs) == 0 {
		return nil
	}
	return refs
}

var (
	docQueryTokenPattern = regexp.MustCompile(`[a-z0-9][a-z0-9\-./_]{2,}`)
	docQueryStopWords    = map[string]struct{}{
		"the": {}, "and": {}, "for": {}, "with": {}, "this": {}, "that": {}, "from": {}, "into": {}, "about": {},
		"show": {}, "please": {}, "need": {}, "help": {}, "could": {}, "would": {}, "should": {}, "kubernetes": {},
		"cluster": {}, "issue": {}, "issues": {}, "problem": {}, "problems": {}, "summary": {}, "diagnostics": {},
	}
)

func buildDocsQueries(message, diagnosticsSummary string) []string {
	out := make([]string, 0, 4)
	seen := map[string]struct{}{}
	appendQuery := func(value string) {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			return
		}
		key := strings.ToLower(trimmed)
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		out = append(out, trimmed)
	}

	message = strings.TrimSpace(message)
	diagnosticsSummary = strings.TrimSpace(diagnosticsSummary)
	messageTerms := extractDocKeywords(message, 8)
	diagnosticsTerms := extractDocKeywords(diagnosticsSummary, 10)

	appendQuery(message)
	if len(messageTerms) > 0 && len(diagnosticsTerms) > 0 {
		appendQuery(strings.Join(append(append([]string{}, messageTerms...), diagnosticsTerms...), " "))
	}
	if len(diagnosticsTerms) > 0 {
		appendQuery(strings.Join(diagnosticsTerms, " "))
	}
	if len(messageTerms) > 0 {
		appendQuery(strings.Join(messageTerms, " "))
	}

	return out
}

func extractDocKeywords(input string, limit int) []string {
	if limit <= 0 {
		return nil
	}
	raw := docQueryTokenPattern.FindAllString(strings.ToLower(input), -1)
	if len(raw) == 0 {
		return nil
	}

	out := make([]string, 0, limit)
	seen := make(map[string]struct{}, limit)
	for _, token := range raw {
		if len(token) <= 2 {
			continue
		}
		if _, excluded := docQueryStopWords[token]; excluded {
			continue
		}
		if _, exists := seen[token]; exists {
			continue
		}
		seen[token] = struct{}{}
		out = append(out, token)
		if len(out) >= limit {
			break
		}
	}
	return out
}

func mapDocReferencesForAI(refs []model.DocumentationReference) []ai.DocReference {
	out := make([]ai.DocReference, 0, len(refs))
	for _, ref := range refs {
		out = append(out, ai.DocReference{
			Title:   ref.Title,
			URL:     ref.URL,
			Source:  ref.Source,
			Snippet: ref.Snippet,
		})
	}
	return out
}

func buildDocumentationContext(refs []model.DocumentationReference) string {
	if len(refs) == 0 {
		return "No documentation snippets available."
	}

	lines := make([]string, 0, len(refs))
	for _, ref := range refs {
		if strings.TrimSpace(ref.Snippet) == "" {
			continue
		}
		lines = append(lines, fmt.Sprintf("[%s] %s", ref.Title, ref.Snippet))
	}
	if len(lines) == 0 {
		return "References available without snippets."
	}
	return strings.Join(lines, "\n")
}
