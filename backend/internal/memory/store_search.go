package memory

import (
	"strings"

	"kubelens-backend/internal/model"
)

func runbookMatches(runbook model.MemoryRunbook, needle string) bool {
	if strings.Contains(strings.ToLower(runbook.Title), needle) {
		return true
	}
	if strings.Contains(strings.ToLower(runbook.Description), needle) {
		return true
	}
	for _, tag := range runbook.Tags {
		if strings.Contains(strings.ToLower(tag), needle) {
			return true
		}
	}
	for _, step := range runbook.Steps {
		if strings.Contains(strings.ToLower(step), needle) {
			return true
		}
	}
	return false
}

func searchTerms(query string) []string {
	if strings.TrimSpace(query) == "" {
		return nil
	}
	fields := strings.FieldsFunc(query, func(r rune) bool {
		return !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9')
	})
	out := make([]string, 0, len(fields))
	seen := map[string]struct{}{}
	for _, field := range fields {
		term := strings.TrimSpace(strings.ToLower(field))
		if term == "" {
			continue
		}
		if _, ok := seen[term]; ok {
			continue
		}
		seen[term] = struct{}{}
		out = append(out, term)
	}
	return out
}

func runbookMatchScore(runbook model.MemoryRunbook, needle string, terms []string) int {
	if strings.TrimSpace(needle) == "" {
		return 0
	}
	if !runbookMatches(runbook, needle) {
		return 0
	}

	score := 0
	title := strings.ToLower(runbook.Title)
	description := strings.ToLower(runbook.Description)
	tags := make([]string, 0, len(runbook.Tags))
	for _, tag := range runbook.Tags {
		tags = append(tags, strings.ToLower(tag))
	}
	steps := make([]string, 0, len(runbook.Steps))
	for _, step := range runbook.Steps {
		steps = append(steps, strings.ToLower(step))
	}

	if strings.Contains(title, needle) {
		score += 12
	}
	if strings.Contains(description, needle) {
		score += 4
	}

	for _, term := range terms {
		if strings.Contains(title, term) {
			score += 8
		}
		if strings.Contains(description, term) {
			score += 3
		}
		for _, tag := range tags {
			if tag == term {
				score += 7
				continue
			}
			if strings.Contains(tag, term) {
				score += 5
			}
		}
		for _, step := range steps {
			if strings.Contains(step, term) {
				score += 2
				break
			}
		}
	}

	return score
}
