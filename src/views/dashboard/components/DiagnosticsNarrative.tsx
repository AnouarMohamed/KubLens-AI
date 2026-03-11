import type { ClusterStats, DiagnosticsResult } from "../../../types";
import { FindingCard, SnapshotRow } from "./DashboardPrimitives";
import { formatTimestamp } from "../utils";

interface DiagnosticsNarrativeProps {
  diagnostics: DiagnosticsResult | null;
  stats: ClusterStats | null;
  prioritizedIssues: DiagnosticsResult["issues"];
}

export function DiagnosticsNarrative({ diagnostics, stats, prioritizedIssues }: DiagnosticsNarrativeProps) {
  return (
    <section className="surface p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Diagnostics Narrative</h3>
          <p className="text-xs text-zinc-500 mt-1">Prioritized findings with direct operational actions.</p>
        </div>
        {diagnostics && <p className="text-xs text-zinc-500">Updated: {formatTimestamp(diagnostics.timestamp)}</p>}
      </div>
      {diagnostics ? (
        <>
          <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
            <section className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cluster Snapshot</h4>
              <div className="mt-3 space-y-2 text-sm">
                <SnapshotRow label="Health" value={`${diagnostics.healthScore}/100`} />
                <SnapshotRow label="Pods" value={`${stats?.pods.total ?? 0} total`} />
                <SnapshotRow label="Nodes" value={`${stats?.nodes.ready ?? 0}/${stats?.nodes.total ?? 0} ready`} />
                <SnapshotRow label="Critical" value={String(diagnostics.criticalIssues)} />
                <SnapshotRow label="Warnings" value={String(diagnostics.warningIssues)} />
              </div>
            </section>

            <section className="xl:col-span-2 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Prioritized Findings</h4>
              <div className="mt-3 space-y-2">
                {prioritizedIssues.map((issue, index) => (
                  <FindingCard
                    key={`${issue.message}-${issue.resource ?? "resource"}-${index}`}
                    severity={issue.severity}
                    title={issue.message}
                    resource={issue.resource}
                    details={(issue.evidence ?? []).join(" | ") || "No evidence captured."}
                    recommendation={issue.recommendation}
                  />
                ))}
                {prioritizedIssues.length === 0 && (
                  <p className="text-sm text-zinc-500">No findings reported. System diagnostics are currently clean.</p>
                )}
              </div>
            </section>
          </div>

          <details className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Raw narrative
            </summary>
            <pre className="mt-3 whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">{diagnostics.summary}</pre>
          </details>
        </>
      ) : (
        <p className="text-sm text-zinc-400 mt-3">Diagnostics data unavailable.</p>
      )}
    </section>
  );
}
