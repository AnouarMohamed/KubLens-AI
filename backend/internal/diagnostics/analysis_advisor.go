package diagnostics

import (
	"fmt"
	"strings"

	"kubelens-backend/internal/model"
)

// GenerateManifestTemplate returns a hardened starter deployment template.
func GenerateManifestTemplate() string {
	return strings.Join([]string{
		"```yaml",
		"apiVersion: apps/v1",
		"kind: Deployment",
		"metadata:",
		"  name: web-api",
		"  namespace: production",
		"spec:",
		"  replicas: 2",
		"  selector:",
		"    matchLabels:",
		"      app: web-api",
		"  template:",
		"    metadata:",
		"      labels:",
		"        app: web-api",
		"    spec:",
		"      containers:",
		"      - name: web-api",
		"        image: ghcr.io/example/web-api:1.0.0",
		"        ports:",
		"        - containerPort: 8080",
		"        resources:",
		"          requests:",
		"            cpu: 100m",
		"            memory: 128Mi",
		"          limits:",
		"            cpu: 500m",
		"            memory: 512Mi",
		"```",
	}, "\n")
}

// BuildPriorityActions creates a concise markdown list of highest priority issues.
func BuildPriorityActions(diag model.DiagnosticsResult) string {
	lines := []string{"### Priority Actions", ""}
	count := 0
	for _, issue := range diag.Issues {
		if issue.Severity == model.SeverityInfo {
			continue
		}

		resource := ""
		if issue.Resource != "" {
			resource = fmt.Sprintf(" (%s)", issue.Resource)
		}

		lines = append(lines,
			fmt.Sprintf("- %s%s", issue.Title, resource),
			fmt.Sprintf("  - %s", issue.Recommendation),
		)
		count++
		if count >= 5 {
			break
		}
	}

	if count == 0 {
		lines = append(lines, "No high-priority findings detected in the latest snapshot.")
	}

	return strings.Join(lines, "\n")
}
