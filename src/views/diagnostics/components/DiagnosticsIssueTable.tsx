import type { DiagnosticsResult } from "../../../types";
import { SeverityBadge } from "./DiagnosticsPrimitives";

interface DiagnosticsIssueTableProps {
  issues: DiagnosticsResult["issues"];
}

export function DiagnosticsIssueTable({ issues }: DiagnosticsIssueTableProps) {
  return (
    <section className="table-shell">
      <header className="border-b border-zinc-700 bg-zinc-900/70 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Issue Registry</p>
      </header>
      <table className="min-w-full text-left text-sm">
        <thead className="table-head table-head-sticky">
          <tr>
            <th className="px-4 py-3 font-semibold">Severity</th>
            <th className="px-4 py-3 font-semibold">Finding</th>
            <th className="px-4 py-3 font-semibold">Resource</th>
            <th className="px-4 py-3 font-semibold">Evidence</th>
            <th className="px-4 py-3 font-semibold">Recommendation</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-700 text-zinc-200">
          {issues.map((issue, index) => (
            <tr key={`${issue.message}-${index}`} className="table-row">
              <td className="px-4 py-3">
                <SeverityBadge severity={issue.severity} />
              </td>
              <td className="px-4 py-3 font-medium">{issue.message}</td>
              <td className="px-4 py-3 text-zinc-400">{issue.resource || "-"}</td>
              <td className="px-4 py-3 text-zinc-400">
                {(issue.evidence ?? []).join(" | ") || "No evidence captured."}
              </td>
              <td className="px-4 py-3 text-zinc-400">{issue.recommendation}</td>
            </tr>
          ))}
          {issues.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                No diagnostic issues detected.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
