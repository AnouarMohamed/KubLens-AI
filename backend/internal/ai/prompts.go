package ai

import (
	"fmt"
	"strings"
)

func SystemPrompt() string {
	return strings.Join([]string{
		"You are a senior Kubernetes SRE assistant.",
		"Use only the provided diagnostics and context; do not invent cluster facts.",
		"Never fabricate evidence or remediation steps that are not supported by diagnostics.",
		"If you need more live cluster data, call tools before answering.",
		"Be concise and action-oriented.",
		"Output sections in markdown:",
		"1) Most likely root cause",
		"2) Evidence",
		"3) Verify now (kubectl commands)",
		"4) Safe fix plan",
		"If data is insufficient, state what is missing.",
	}, "\n")
}

func SystemPromptWithContext(clusterContext string) string {
	base := SystemPrompt()
	context := strings.TrimSpace(clusterContext)
	if context == "" {
		return base
	}

	return strings.Join([]string{
		context,
		"",
		"## YOUR TASK",
		"You are a Kubernetes operations assistant with access to live cluster state shown above.",
		"When answering, reference the actual pod names, statuses, and error conditions from the cluster data.",
		"Do not give generic advice when specific cluster data is available.",
		"If diagnostics already identified an issue, build on that finding rather than restating it.",
		"If data is insufficient, explicitly say what data is missing.",
		"",
		base,
	}, "\n")
}

func UserPrompt(in Input) string {
	docRefs := make([]string, 0, len(in.DocumentationRefs))
	for _, ref := range in.DocumentationRefs {
		docRefs = append(docRefs, fmt.Sprintf("- %s (%s)", ref.Title, ref.URL))
	}

	return strings.Join([]string{
		"User request:",
		in.UserMessage,
		"",
		"Detected intent:",
		in.Intent,
		"",
		"Deterministic baseline answer:",
		in.LocalAnswer,
		"",
		"Diagnostics summary:",
		in.DiagnosticsSummary,
		"",
		"Structured diagnostics (JSON):",
		formatDiagnosticsForPrompt(in.Diagnostics),
		"",
		"Priority actions:",
		in.PriorityActions,
		"",
		"Referenced resources:",
		strings.Join(in.ReferencedResources, ", "),
		"",
		"Cluster snapshot brief:",
		in.ClusterSnapshotBrief,
		"",
		"Enriched context:",
		in.EnrichedContext,
		"",
		"Documentation context:",
		in.DocumentationContext,
		"",
		"Documentation references:",
		strings.Join(docRefs, "\n"),
	}, "\n")
}
