package intelligence

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

type Severity string

const (
	SeverityCritical Severity = "critical"
	SeverityWarning  Severity = "warning"
	SeverityInfo     Severity = "info"
)

type Diagnostic struct {
	Severity       Severity `json:"severity"`
	Resource       string   `json:"resource,omitempty"`
	Namespace      string   `json:"namespace,omitempty"`
	Message        string   `json:"message"`
	Evidence       []string `json:"evidence,omitempty"`
	Recommendation string   `json:"recommendation"`
	Source         string   `json:"source,omitempty"`
}

type Report struct {
	GeneratedAt    string       `json:"generatedAt"`
	Diagnostics    []Diagnostic `json:"diagnostics"`
	CriticalIssues int          `json:"criticalIssues"`
	WarningIssues  int          `json:"warningIssues"`
	InfoIssues     int          `json:"infoIssues"`
	HealthScore    int          `json:"healthScore"`
	Summary        string       `json:"summary"`
}

func summarize(report Report) string {
	if len(report.Diagnostics) == 0 {
		return "No diagnostic findings were produced."
	}

	lines := []string{
		fmt.Sprintf("### Cluster Health Score: %d/100", report.HealthScore),
		"",
		fmt.Sprintf("- Critical: %d", report.CriticalIssues),
		fmt.Sprintf("- Warning: %d", report.WarningIssues),
		fmt.Sprintf("- Info: %d", report.InfoIssues),
		"",
		"### Findings",
	}

	for _, diag := range report.Diagnostics {
		if diag.Severity == SeverityInfo {
			continue
		}
		resource := diag.Resource
		if diag.Namespace != "" {
			resource = diag.Namespace + "/" + diag.Resource
		}
		if resource != "" {
			resource = " (" + resource + ")"
		}
		lines = append(lines, fmt.Sprintf("- **%s**: %s%s", strings.ToUpper(string(diag.Severity)), diag.Message, resource))
		if len(diag.Evidence) > 0 {
			lines = append(lines, fmt.Sprintf("  - Evidence: %s", strings.Join(diag.Evidence, " | ")))
		}
		lines = append(lines, fmt.Sprintf("  - Recommended action: %s", diag.Recommendation))
	}

	return strings.Join(lines, "\n")
}

func ensureInfoFallback(diags []Diagnostic) []Diagnostic {
	if len(diags) > 0 {
		return diags
	}
	return []Diagnostic{
		{
			Severity:       SeverityInfo,
			Message:        "Cluster healthy",
			Recommendation: "Continue monitoring and keep alerting enabled.",
		},
	}
}

func sortDiagnostics(diags []Diagnostic) {
	priority := map[Severity]int{
		SeverityCritical: 0,
		SeverityWarning:  1,
		SeverityInfo:     2,
	}
	sort.SliceStable(diags, func(i, j int) bool {
		if priority[diags[i].Severity] == priority[diags[j].Severity] {
			return diags[i].Message < diags[j].Message
		}
		return priority[diags[i].Severity] < priority[diags[j].Severity]
	})
}

func newReport(now time.Time, diags []Diagnostic) Report {
	diags = ensureInfoFallback(diags)
	sortDiagnostics(diags)

	critical := 0
	warning := 0
	info := 0
	for _, diag := range diags {
		switch diag.Severity {
		case SeverityCritical:
			critical++
		case SeverityWarning:
			warning++
		default:
			info++
		}
	}

	health := 100 - (critical*25 + warning*10)
	if health < 0 {
		health = 0
	}
	if health > 100 {
		health = 100
	}

	report := Report{
		GeneratedAt:    now.UTC().Format(time.RFC3339),
		Diagnostics:    diags,
		CriticalIssues: critical,
		WarningIssues:  warning,
		InfoIssues:     info,
		HealthScore:    health,
	}
	report.Summary = summarize(report)
	return report
}
