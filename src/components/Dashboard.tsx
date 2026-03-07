import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { ClusterStats, DiagnosticsResult, K8sEvent, Node, Pod } from "../types";

export default function Dashboard() {
  const [stats, setStats] = useState<ClusterStats | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [events, setEvents] = useState<K8sEvent[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [pods, setPods] = useState<Pod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statsResponse, diagnosticsResponse, eventsResponse, nodesResponse, podsResponse] = await Promise.all([
        api.getStats(),
        api.getDiagnostics(),
        api.getEvents(),
        api.getNodes(),
        api.getPods(),
      ]);
      setStats(statsResponse);
      setDiagnostics(diagnosticsResponse);
      setEvents(eventsResponse.slice(0, 8));
      setNodes(nodesResponse);
      setPods(podsResponse);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const topRiskPods = useMemo(() => [...pods].sort((a, b) => b.restarts - a.restarts).slice(0, 5), [pods]);
  const podStack = useMemo(() => buildPodStack(stats), [stats]);
  const prioritizedIssues = useMemo(() => buildPrioritizedIssues(diagnostics), [diagnostics]);

  return (
    <div className="space-y-6">
      <header className="surface p-6 text-zinc-100">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Operations Overview</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Cluster Command Deck</h2>
            <p className="text-sm text-zinc-300 mt-2 max-w-2xl">
              Real-time posture of workloads, infrastructure pressure, and system risk.
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={isLoading}
            className="h-10 rounded-xl border border-zinc-600 px-4 text-sm font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
          >
            {isLoading ? "Refreshing" : "Refresh Data"}
          </button>
        </div>
      </header>

      {error && <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">{error}</div>}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPI label="Cluster CPU" value={stats?.cluster.cpu ?? "-"} />
        <KPI label="Cluster Memory" value={stats?.cluster.memory ?? "-"} />
        <KPI label="Total Pods" value={String(stats?.pods.total ?? 0)} />
        <KPI label="Node Availability" value={`${stats?.nodes.ready ?? 0}/${stats?.nodes.total ?? 0}`} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="surface p-5 xl:col-span-2">
          <h3 className="text-sm font-semibold text-zinc-100">Workload Health Composition</h3>
          <p className="text-xs text-zinc-400 mt-1">Distribution of pod lifecycle states across the cluster.</p>
          <div className="mt-5 rounded-xl border border-zinc-700 overflow-hidden">
            <div className="h-8 flex bg-zinc-800">
              {podStack.map((segment) => (
                <div
                  key={segment.label}
                  className={`${segment.color} h-full flex items-center justify-center text-[11px] font-semibold text-white`}
                  style={{ width: `${segment.width}%` }}
                  title={`${segment.label}: ${segment.value}`}
                >
                  {segment.width > 12 ? `${segment.label} ${segment.value}` : ""}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {podStack.map((segment) => (
              <div key={segment.label} className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-2 py-2">
                <p className="text-zinc-400">{segment.label}</p>
                <p className="text-zinc-100 font-semibold mt-0.5">{segment.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <h4 className="text-sm font-semibold text-zinc-100">Node Utilization</h4>
            <div className="mt-3 space-y-3">
              {nodes.slice(0, 6).map((node) => (
                <div key={node.name} className="rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-zinc-100">{node.name}</span>
                    <span className="text-zinc-400">CPU {node.cpuUsage} / Mem {node.memUsage}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-zinc-700 overflow-hidden">
                    <div className="h-full bg-[#2496ed]" style={{ width: parsePercent(node.cpuUsage) }} />
                  </div>
                </div>
              ))}
              {nodes.length === 0 && <p className="text-sm text-zinc-400">Node telemetry unavailable.</p>}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="surface p-5">
            <h3 className="text-sm font-semibold text-zinc-100">Top Risk Pods</h3>
            <p className="text-xs text-zinc-400 mt-1">Highest restart pressure.</p>
            <div className="mt-3 space-y-2">
              {topRiskPods.map((pod) => (
                <div key={pod.id} className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-zinc-100 truncate">{pod.name}</span>
                    <span className="rounded-full bg-[#d946ef]/18 px-2 py-0.5 text-zinc-100 font-semibold">{pod.restarts} restarts</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 mt-1">{pod.namespace} | {pod.status}</p>
                </div>
              ))}
              {topRiskPods.length === 0 && <p className="text-sm text-zinc-400">No pod risk signals yet.</p>}
            </div>
          </div>

          <div className="surface p-5">
            <h3 className="text-sm font-semibold text-zinc-100">Recent Events</h3>
            <div className="mt-3 space-y-2">
              {events.map((event, index) => (
                <div key={`${event.reason}-${index}`} className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-100">{event.reason}</span>
                    <span className="text-zinc-400">{event.age}</span>
                  </div>
                  <p className="text-[11px] text-zinc-300 mt-1 leading-relaxed">{event.message}</p>
                </div>
              ))}
              {events.length === 0 && <p className="text-sm text-zinc-400">No recent events available.</p>}
            </div>
          </div>
        </div>
      </section>

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
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <MiniMetric label="Health Score" value={`${diagnostics.healthScore}/100`} />
              <MiniMetric label="Critical" value={String(diagnostics.criticalIssues)} />
              <MiniMetric label="Warnings" value={String(diagnostics.warningIssues)} />
            </div>

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
                <div className="mt-3">
                  <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">Health Trend</p>
                  <div className="mt-2 h-2 rounded-full bg-zinc-700 overflow-hidden">
                    <div className="h-full bg-[#4f7bff]" style={{ width: `${Math.max(0, Math.min(100, diagnostics.healthScore))}%` }} />
                  </div>
                </div>
              </section>

              <section className="xl:col-span-2 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Prioritized Findings</h4>
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
                    <p className="text-sm text-zinc-500">No findings reported. System diagnostics are currently clean.</p>
                  )}
                </div>
              </section>
            </div>

            <details className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-500">Raw narrative</summary>
              <pre className="mt-3 whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">{diagnostics.summary}</pre>
            </details>
          </>
        ) : (
          <p className="text-sm text-zinc-400 mt-3">Diagnostics data unavailable.</p>
        )}
      </section>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <p className="text-[11px] uppercase tracking-wide text-zinc-400 font-semibold">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-zinc-100 tracking-tight">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-zinc-400 font-semibold">{label}</p>
      <p className="text-base font-semibold text-zinc-100 mt-0.5">{value}</p>
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2">
      <span className="text-zinc-500">{label}</span>
      <span className="font-semibold text-zinc-100">{value}</span>
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
  severity: "critical" | "warning" | "info";
  title: string;
  resource?: string;
  details: string;
  recommendation: string;
}) {
  return (
    <article className="rounded-md border border-zinc-700 bg-zinc-900/60 p-3">
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

function SeverityBadge({ severity }: { severity: "critical" | "warning" | "info" }) {
  const label = severity.toUpperCase();
  const className =
    severity === "critical"
      ? "border-[#d946ef]/50 bg-[#d946ef]/16 text-zinc-100"
      : severity === "warning"
        ? "border-[#eab308]/50 bg-[#eab308]/14 text-zinc-100"
        : "border-[#4f7bff]/50 bg-[#4f7bff]/14 text-zinc-100";

  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${className}`}>{label}</span>;
}

function buildPrioritizedIssues(diagnostics: DiagnosticsResult | null) {
  if (!diagnostics) {
    return [];
  }

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return [...diagnostics.issues].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 8);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function buildPodStack(stats: ClusterStats | null): Array<{ label: string; value: number; width: number; color: string }> {
  if (!stats || stats.pods.total === 0) {
    return [];
  }

  const succeeded = Math.max(stats.pods.total - stats.pods.running - stats.pods.pending - stats.pods.failed, 0);
  const raw = [
    { label: "Running", value: stats.pods.running, color: "bg-[#4f7bff]" },
    { label: "Pending", value: stats.pods.pending, color: "bg-[#eab308]" },
    { label: "Failed", value: stats.pods.failed, color: "bg-[#d946ef]" },
    { label: "Succeeded", value: succeeded, color: "bg-[#34c759]" },
  ];

  return raw
    .filter((item) => item.value > 0)
    .map((item) => ({
      ...item,
      width: Number(((item.value / stats.pods.total) * 100).toFixed(2)),
    }));
}

function parsePercent(value: string): string {
  const numeric = Number.parseFloat(value.replace("%", ""));
  if (!Number.isFinite(numeric)) {
    return "0%";
  }
  return `${Math.min(Math.max(numeric, 0), 100)}%`;
}
