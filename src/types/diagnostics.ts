export type DiagnosticSeverity = "critical" | "warning" | "info";

export interface DiagnosticIssue {
  severity: DiagnosticSeverity;
  resource?: string;
  namespace?: string;
  message: string;
  evidence?: string[];
  recommendation: string;
  source?: string;
}

export interface DiagnosticsResult {
  summary: string;
  timestamp: string;
  criticalIssues: number;
  warningIssues: number;
  healthScore: number;
  issues: DiagnosticIssue[];
}
