import type { DiagnosticsResult } from "../../../types";
import { formatTimestamp } from "../utils";
import { FindingCard, SnapshotRow, StatCard } from "./DiagnosticsPrimitives";

interface DiagnosticsOverviewProps {
  diagnostics: DiagnosticsResult;
  summaryHighlights: string[];
  prioritizedIssues: DiagnosticsResult["issues"];
}

export function DiagnosticsOverview({ diagnostics, summaryHighlights, prioritizedIssues }: DiagnosticsOverviewProps) {
  return (
    <>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Health Score" value={`${diagnostics.healthScore}/100`} />
        <StatCard label="Critical Issues" value={String(diagnostics.criticalIssues)} />
        <StatCard label="Warning Issues" value={String(diagnostics.warningIssues)} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cluster Snapshot</p>
            <p className="text-[11px] text-zinc-500">{formatTimestamp(diagnostics.timestamp)}</p>
          </div>

          <div className="mt-3 space-y-2">
            <SnapshotRow label="Health Score" value={`${diagnostics.healthScore}/100`} />
            <SnapshotRow label="Critical" value={String(diagnostics.criticalIssues)} />
            <SnapshotRow label="Warnings" value={String(diagnostics.warningIssues)} />
            <SnapshotRow label="Total Findings" value={String(diagnostics.issues.length)} />
          </div>

          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Health Progress</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-700">
              <div
                className="h-full bg-[#3b82f6]"
                style={{ width: `${Math.max(0, Math.min(100, diagnostics.healthScore))}%` }}
              />
            </div>
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Highlights</p>
            <div className="mt-2 space-y-1.5">
              {summaryHighlights.slice(0, 5).map((line, index) => (
                <p key={index} className="text-sm leading-relaxed text-zinc-300">
                  {line}
                </p>
              ))}
              {summaryHighlights.length === 0 && (
                <p className="text-sm text-zinc-500">No summary highlights available.</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 xl:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Prioritized Findings</p>
          <div className="mt-3 space-y-2">
            {prioritizedIssues.map((issue, index) => (
              <FindingCard
                key={`${issue.message}-${issue.resource ?? "resource"}-${index}`}
                severity={issue.severity}
                title={issue.message}
                resource={issue.resource}
                details={(issue.evidence ?? []).join(" | ") || "No supporting evidence captured yet."}
                recommendation={issue.recommendation}
              />
            ))}
            {prioritizedIssues.length === 0 && (
              <p className="text-sm text-zinc-500">
                No diagnostic issues detected. Cluster posture is currently healthy.
              </p>
            )}
          </div>
        </section>
      </section>
    </>
  );
}
