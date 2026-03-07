import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthSession } from "../../context/AuthSessionContext";
import { api } from "../../lib/api";
import type { DiagnosticSeverity, DiagnosticsResult } from "../../types";

export default function Diagnostics() {
  const { can } = useAuthSession();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAlerting, setIsAlerting] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canWrite = can("write");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.getDiagnostics();
      setDiagnostics(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diagnostics");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const prioritizedIssues = useMemo(() => buildPrioritizedIssues(diagnostics), [diagnostics]);
  const summaryHighlights = useMemo(() => extractSummaryHighlights(diagnostics?.summary ?? ""), [diagnostics?.summary]);

  const dispatchTopIssue = useCallback(async () => {
    if (!canWrite || !diagnostics || prioritizedIssues.length === 0) {
      return;
    }

    const top = prioritizedIssues[0];
    setIsAlerting(true);
    try {
      const response = await api.dispatchAlert({
        title: `Diagnostics: ${top.title}`,
        message: `${top.details}\nRecommended action: ${top.recommendation}`,
        severity: top.severity,
        source: "diagnostics",
        tags: [top.resource ?? "cluster", top.severity],
      });
      setAlertMessage(
        response.success ? "Alert dispatched to configured channels." : "Alert dispatch partially failed.",
      );
    } catch (err) {
      setAlertMessage(err instanceof Error ? err.message : "Failed to dispatch alert");
    } finally {
      setIsAlerting(false);
    }
  }, [canWrite, diagnostics, prioritizedIssues]);

  const sendTestAlert = useCallback(async () => {
    if (!canWrite) {
      return;
    }

    setIsAlerting(true);
    try {
      const response = await api.sendTestAlert();
      setAlertMessage(response.success ? "Test alert sent." : "Test alert partially failed.");
    } catch (err) {
      setAlertMessage(err instanceof Error ? err.message : "Failed to send test alert");
    } finally {
      setIsAlerting(false);
    }
  }, [canWrite]);

  return (
    <div className="space-y-5">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Diagnostics</h2>
          <p className="text-sm text-zinc-400 mt-1">Automated checks with prioritized, actionable issue reporting.</p>
        </div>
        <button onClick={() => void refresh()} disabled={isLoading} className="btn">
          {isLoading ? "Loading" : "Refresh"}
        </button>
        <div className="flex gap-2">
          <button onClick={() => void sendTestAlert()} disabled={!canWrite || isAlerting} className="btn">
            {isAlerting ? "Sending" : "Test Alert"}
          </button>
          <button
            onClick={() => void dispatchTopIssue()}
            disabled={!canWrite || isAlerting || prioritizedIssues.length === 0}
            className="btn"
          >
            Alert Top Issue
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">{error}</div>
      )}
      {alertMessage && (
        <div className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">
          {alertMessage}
        </div>
      )}

      {diagnostics && (
        <>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Health Score" value={`${diagnostics.healthScore}/100`} />
            <StatCard label="Critical Issues" value={String(diagnostics.criticalIssues)} />
            <StatCard label="Warning Issues" value={String(diagnostics.warningIssues)} />
          </section>

          <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <section className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">Cluster Snapshot</p>
                <p className="text-[11px] text-zinc-500">{formatTimestamp(diagnostics.timestamp)}</p>
              </div>

              <div className="mt-3 space-y-2">
                <SnapshotRow label="Health Score" value={`${diagnostics.healthScore}/100`} />
                <SnapshotRow label="Critical" value={String(diagnostics.criticalIssues)} />
                <SnapshotRow label="Warnings" value={String(diagnostics.warningIssues)} />
                <SnapshotRow label="Total Findings" value={String(diagnostics.issues.length)} />
              </div>

              <div className="mt-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">Health Progress</p>
                <div className="mt-2 h-2 rounded-full bg-zinc-700 overflow-hidden">
                  <div
                    className="h-full bg-[#4f7bff]"
                    style={{ width: `${Math.max(0, Math.min(100, diagnostics.healthScore))}%` }}
                  />
                </div>
              </div>

              <div className="mt-4">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">Highlights</p>
                <div className="mt-2 space-y-1.5">
                  {summaryHighlights.slice(0, 5).map((line, index) => (
                    <p key={index} className="text-sm text-zinc-300 leading-relaxed">
                      {line}
                    </p>
                  ))}
                  {summaryHighlights.length === 0 && (
                    <p className="text-sm text-zinc-500">No summary highlights available.</p>
                  )}
                </div>
              </div>
            </section>

            <section className="xl:col-span-2 rounded-lg border border-zinc-700 bg-zinc-900 p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">Prioritized Findings</p>
              <div className="mt-3 space-y-2">
                {prioritizedIssues.map((issue, index) => (
                  <FindingCard
                    key={`${issue.title}-${issue.resource ?? "resource"}-${index}`}
                    severity={issue.severity}
                    title={issue.title}
                    resource={issue.resource}
                    details={issue.details}
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

          <details className="rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2">
            <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-500 font-semibold">
              Raw narrative
            </summary>
            <pre className="mt-3 whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">{diagnostics.summary}</pre>
          </details>

          <section className="table-shell">
            <header className="px-4 py-3 border-b border-zinc-700 bg-zinc-900/70">
              <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">Issue Registry</p>
            </header>
            <table className="min-w-full text-left text-sm">
              <thead className="table-head table-head-sticky">
                <tr>
                  <th className="px-4 py-3 font-semibold">Severity</th>
                  <th className="px-4 py-3 font-semibold">Title</th>
                  <th className="px-4 py-3 font-semibold">Resource</th>
                  <th className="px-4 py-3 font-semibold">Details</th>
                  <th className="px-4 py-3 font-semibold">Recommendation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-700 text-zinc-200">
                {diagnostics.issues.map((issue, index) => (
                  <tr key={`${issue.title}-${index}`} className="table-row">
                    <td className="px-4 py-3">
                      <SeverityBadge severity={issue.severity} />
                    </td>
                    <td className="px-4 py-3 font-medium">{issue.title}</td>
                    <td className="px-4 py-3 text-zinc-400">{issue.resource || "-"}</td>
                    <td className="px-4 py-3 text-zinc-400">{issue.details}</td>
                    <td className="px-4 py-3 text-zinc-400">{issue.recommendation}</td>
                  </tr>
                ))}
                {diagnostics.issues.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                      No diagnostic issues detected.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="text-sm font-semibold text-zinc-100">{value}</span>
    </div>
  );
}

function FindingCard({
  severity,
  title,
  resource,
  details,
  recommendation,
}: {
  severity: DiagnosticSeverity;
  title: string;
  resource?: string;
  details: string;
  recommendation: string;
}) {
  return (
    <article className="rounded-md border border-zinc-700 bg-zinc-900/65 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={severity} />
        <p className="text-sm font-semibold text-zinc-100">{title}</p>
        {resource && <span className="text-xs text-zinc-500">{resource}</span>}
      </div>
      <p className="mt-2 text-sm text-zinc-300">{details}</p>
      <p className="mt-2 text-sm text-zinc-200">
        <span className="font-semibold text-zinc-100">Action:</span> {recommendation}
      </p>
    </article>
  );
}

function SeverityBadge({ severity }: { severity: DiagnosticSeverity }) {
  const className =
    severity === "critical"
      ? "border-[#d946ef]/50 bg-[#d946ef]/16 text-zinc-100"
      : severity === "warning"
        ? "border-[#eab308]/50 bg-[#eab308]/14 text-zinc-100"
        : "border-[#4f7bff]/50 bg-[#4f7bff]/14 text-zinc-100";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}>
      {severity}
    </span>
  );
}

function buildPrioritizedIssues(diagnostics: DiagnosticsResult | null) {
  if (!diagnostics) {
    return [];
  }

  const rank: Record<DiagnosticSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return [...diagnostics.issues].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 10);
}

function extractSummaryHighlights(summary: string): string[] {
  return summary
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.toLowerCase().startsWith("recommended action"));
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
