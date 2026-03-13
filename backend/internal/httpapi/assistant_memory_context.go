package httpapi

import (
	"fmt"
	"sort"
	"strings"

	"kubelens-backend/internal/model"
)

func (s *Server) buildTeamRunbookContext(query string, resources []string) string {
	if s.memory == nil {
		return ""
	}

	runbookByID := make(map[string]model.MemoryRunbook, 8)
	runbookOrder := make([]string, 0, 8)
	appendRunbooks := func(searchQuery string) {
		if strings.TrimSpace(searchQuery) == "" {
			return
		}
		for _, runbook := range s.memory.Search(searchQuery) {
			if strings.TrimSpace(runbook.ID) == "" {
				continue
			}
			if _, exists := runbookByID[runbook.ID]; exists {
				continue
			}
			runbookByID[runbook.ID] = runbook
			runbookOrder = append(runbookOrder, runbook.ID)
			if len(runbookOrder) >= 5 {
				return
			}
		}
	}

	appendRunbooks(query)
	for _, resource := range resources {
		if len(runbookOrder) >= 5 {
			break
		}
		trimmed := strings.TrimSpace(resource)
		if trimmed == "" {
			continue
		}
		appendRunbooks(trimmed)
		if parts := strings.Split(trimmed, "/"); len(parts) > 0 {
			appendRunbooks(parts[len(parts)-1])
		}
	}

	relevantFixes := selectRelevantFixes(s.memory.ListFixes(), query, resources, 3)
	if len(runbookOrder) == 0 && len(relevantFixes) == 0 {
		return ""
	}

	var sb strings.Builder
	if len(runbookOrder) > 0 {
		sb.WriteString("## TEAM RUNBOOKS\n")
	}
	for _, runbookID := range runbookOrder {
		runbook := runbookByID[runbookID]
		s.memory.IncrementUsage(runbook.ID)

		sb.WriteString("- Title: ")
		sb.WriteString(strings.TrimSpace(runbook.Title))
		sb.WriteString("\n")
		tags := strings.Join(runbook.Tags, ", ")
		if strings.TrimSpace(tags) == "" {
			tags = "none"
		}
		sb.WriteString("  Tags: ")
		sb.WriteString(tags)
		sb.WriteString("\n")
		if desc := strings.TrimSpace(runbook.Description); desc != "" {
			sb.WriteString("  Description: ")
			sb.WriteString(desc)
			sb.WriteString("\n")
		}
		sb.WriteString("  Steps:\n")
		for i, step := range runbook.Steps {
			if i >= 6 {
				sb.WriteString("  ... additional steps omitted\n")
				break
			}
			sb.WriteString(fmt.Sprintf("  %d. %s\n", i+1, strings.TrimSpace(step)))
		}
	}

	if len(relevantFixes) > 0 {
		if sb.Len() > 0 {
			sb.WriteString("\n")
		}
		sb.WriteString("## TEAM FIX PATTERNS\n")
		for _, fix := range relevantFixes {
			sb.WriteString("- Title: ")
			sb.WriteString(strings.TrimSpace(fix.Title))
			sb.WriteString("\n")
			sb.WriteString("  Kind: ")
			sb.WriteString(string(fix.Kind))
			sb.WriteString("\n")
			if resource := strings.TrimSpace(fix.Resource); resource != "" {
				sb.WriteString("  Resource: ")
				sb.WriteString(resource)
				sb.WriteString("\n")
			}
			if desc := strings.TrimSpace(fix.Description); desc != "" {
				sb.WriteString("  Description: ")
				sb.WriteString(desc)
				sb.WriteString("\n")
			}
		}
	}

	return strings.TrimSpace(sb.String())
}

func selectRelevantFixes(
	fixes []model.MemoryFixPattern,
	query string,
	resources []string,
	limit int,
) []model.MemoryFixPattern {
	if len(fixes) == 0 || limit <= 0 {
		return nil
	}

	queryLower := strings.ToLower(strings.TrimSpace(query))
	resourceSet := make(map[string]struct{}, len(resources))
	for _, resource := range resources {
		trimmed := strings.ToLower(strings.TrimSpace(resource))
		if trimmed == "" {
			continue
		}
		resourceSet[trimmed] = struct{}{}
	}

	type scoredFix struct {
		fix   model.MemoryFixPattern
		score int
	}
	scored := make([]scoredFix, 0, len(fixes))
	for _, fix := range fixes {
		score := 0
		title := strings.ToLower(strings.TrimSpace(fix.Title))
		description := strings.ToLower(strings.TrimSpace(fix.Description))
		resource := strings.ToLower(strings.TrimSpace(fix.Resource))
		kind := strings.ToLower(strings.TrimSpace(string(fix.Kind)))

		if queryLower != "" {
			if strings.Contains(title, queryLower) {
				score += 8
			}
			if strings.Contains(description, queryLower) {
				score += 5
			}
			if strings.Contains(resource, queryLower) {
				score += 6
			}
			if strings.Contains(kind, queryLower) {
				score += 4
			}
		}
		for resourceHint := range resourceSet {
			if resourceHint == resource {
				score += 10
				continue
			}
			if strings.Contains(resource, resourceHint) || strings.Contains(resourceHint, resource) {
				score += 6
			}
		}

		if queryLower != "" || len(resourceSet) > 0 {
			if score == 0 {
				continue
			}
		}
		scored = append(scored, scoredFix{fix: fix, score: score})
	}

	if len(scored) == 0 {
		return nil
	}

	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].score != scored[j].score {
			return scored[i].score > scored[j].score
		}
		return scored[i].fix.RecordedAt > scored[j].fix.RecordedAt
	})

	if len(scored) > limit {
		scored = scored[:limit]
	}
	out := make([]model.MemoryFixPattern, 0, len(scored))
	for _, item := range scored {
		out = append(out, item.fix)
	}
	return out
}
