import type { DiagnosticSeverity, DiagnosticsResult } from "../../types";

export function buildPrioritizedIssues(diagnostics: DiagnosticsResult | null) {
  if (!diagnostics) {
    return [];
  }

  const rank: Record<DiagnosticSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return [...diagnostics.issues].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 10);
}

export function extractSummaryHighlights(summary: string): string[] {
  return summary
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.toLowerCase().startsWith("recommended action"));
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
