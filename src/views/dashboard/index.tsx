import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../lib/api";
import type { ApiMetricsSnapshot, ClusterStats, DiagnosticsResult, K8sEvent, Node, Pod } from "../../types";

const ACCENT = "#00d4a8";
const RED = "#ff4444";
const AMBER = "#f59e0b";
const BLUE = "#3b82f6";
const MUTED = "#52525b";
const GRID_BASELINE = "#1f1f1f";

const TOOLTIP_STYLE = {
  background: "#161616",
  border: "1px solid #2a2a2a",
  color: "#e8e8e8",
  fontSize: "11px",
  fontFamily: "monospace",
  borderRadius: "4px",
  padding: "6px 10px",
};

const AXIS_TICK = { fill: "#444444", fontSize: 11, fontFamily: "monospace" };

export default function Dashboard() {
  const [stats, setStats] = useState<ClusterStats | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [events, setEvents] = useState<K8sEvent[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [pods, setPods] = useState<Pod[]>([]);
  const [apiMetrics, setApiMetrics] = useState<ApiMetricsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statsResponse, diagnosticsResponse, eventsResponse, nodesResponse, podsResponse, apiMetricsResponse] =
        await Promise.all([
          api.getStats(),
          api.getDiagnostics(),
          api.getEvents(),
          api.getNodes(),
          api.getPods(),
          api.getApiMetrics(),
        ]);
      setStats(statsResponse);
      setDiagnostics(diagnosticsResponse);
      setEvents(eventsResponse);
      setNodes(nodesResponse);
      setPods(podsResponse);
      setApiMetrics(apiMetricsResponse);
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

  const topRiskPods = useMemo(() => [...pods].sort((a, b) => b.restarts - a.restarts).slice(0, 6), [pods]);
  const prioritizedIssues = useMemo(() => buildPrioritizedIssues(diagnostics), [diagnostics]);

  const podMixData = useMemo(() => buildPodMixData(stats), [stats]);
  const nodeUsageBars = useMemo(() => buildNodeUsageBars(nodes), [nodes]);
  const nodeCPUTrend = useMemo(() => buildNodeCPUTrend(nodes), [nodes]);
  const restartHotspots = useMemo(() => buildRestartHotspots(pods), [pods]);
  const eventReasonBars = useMemo(() => buildEventReasonBars(events), [events]);
  const apiStatusMix = useMemo(() => buildAPIStatusMix(apiMetrics), [apiMetrics]);

  const pendingRate = useMemo(() => percentage(stats?.pods.pending ?? 0, stats?.pods.total ?? 0), [stats]);
  const failedRate = useMemo(() => percentage(stats?.pods.failed ?? 0, stats?.pods.total ?? 0), [stats]);
  const notReadyRate = useMemo(() => percentage(stats?.nodes.notReady ?? 0, stats?.nodes.total ?? 0), [stats]);
  const nodeAvailabilityPercent = useMemo(() => percentage(stats?.nodes.ready ?? 0, stats?.nodes.total ?? 0), [stats]);

  const kpis = useMemo(
    () => [
      { label: "Cluster CPU", value: stats?.cluster.cpu ?? "-", critical: false },
      { label: "Cluster Memory", value: stats?.cluster.memory ?? "-", critical: false },
      { label: "Failed Rate", value: `${failedRate.toFixed(1)}%`, critical: failedRate > 0 },
      {
        label: "Node Availability",
        value: `${stats?.nodes.ready ?? 0}/${stats?.nodes.total ?? 0}`,
        critical: nodeAvailabilityPercent > 0 && nodeAvailabilityPercent < 80,
      },
    ],
    [stats, failedRate, nodeAvailabilityPercent],
  );

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#666666]">cluster overview</p>
          <p className="mt-1 text-lg font-mono font-semibold text-[#e8e8e8]">
            {stats ? `${stats.pods.total} pods | ${stats.nodes.ready}/${stats.nodes.total} nodes ready` : "loading..."}
          </p>
        </div>
        <button onClick={() => void load()} disabled={isLoading} className="btn-sm font-mono">
          {isLoading ? "refreshing..." : "refresh"}
        </button>
      </header>

      {error && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">{error}</div>
      )}

      <section className="flex items-stretch border border-[#1f1f1f] rounded-lg overflow-hidden mb-6">
        {kpis.map((kpi, index) => (
          <div key={kpi.label} className={`flex-1 px-5 py-4 ${index > 0 ? "border-l border-[#1f1f1f]" : ""}`}>
            <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#444444]">{kpi.label}</p>
            <p
              className={`mt-1.5 text-2xl font-mono font-semibold ${kpi.critical ? "text-[#ff4444]" : "text-[#e8e8e8]"}`}
            >
              {kpi.value}
            </p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RiskRail label="Pending Pod Rate" value={pendingRate} />
        <RiskRail label="Failed Pod Rate" value={failedRate} />
        <RiskRail label="NotReady Node Rate" value={notReadyRate} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Pod Lifecycle Mix" subtitle="Composition of running, pending, failed, and succeeded pods.">
          <PodLifecycleMix data={podMixData} />
        </ChartCard>

        <ChartCard title="Node Utilization" subtitle="CPU and memory percentage by node (top 8).">
          {nodeUsageBars.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={nodeUsageBars} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <ReferenceLine y={0} stroke={GRID_BASELINE} />
                <XAxis dataKey="name" tick={AXIS_TICK} interval={0} angle={-20} textAnchor="end" height={48} />
                <YAxis domain={[0, 100]} tick={AXIS_TICK} unit="%" />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number | string | undefined, key: string | undefined) => [
                    `${coerceNumber(value).toFixed(1)}%`,
                    key === "cpu" ? "CPU" : "Memory",
                  ]}
                />
                <Bar dataKey="cpu" fill={ACCENT} />
                <Bar dataKey="memory" fill="rgba(0, 212, 168, 0.4)" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No node utilization data available." />
          )}
        </ChartCard>

        <ChartCard title="Average Node CPU Trend" subtitle="Cluster-wide CPU trajectory from node history points.">
          {nodeCPUTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={nodeCPUTrend} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="time" tick={AXIS_TICK} />
                <YAxis domain={[0, 100]} tick={AXIS_TICK} unit="%" />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number | string | undefined) => [`${coerceNumber(value).toFixed(1)}%`, "Avg CPU"]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={ACCENT}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, fill: ACCENT, stroke: ACCENT }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No CPU history points available." />
          )}
        </ChartCard>

        <ChartCard title="Event Reason Frequency" subtitle="Most common event reasons across recent cluster events.">
          {eventReasonBars.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={eventReasonBars} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <ReferenceLine y={0} stroke={GRID_BASELINE} />
                <XAxis dataKey="name" tick={AXIS_TICK} interval={0} angle={-20} textAnchor="end" height={48} />
                <YAxis allowDecimals={false} tick={AXIS_TICK} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number | string | undefined) => [Math.round(coerceNumber(value)), "Events"]}
                />
                <Bar dataKey="count" fill={BLUE} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No event reason data available." />
          )}
        </ChartCard>

        <ChartCard title="Restart Hotspots" subtitle="Pods with highest restart pressure.">
          {restartHotspots.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={restartHotspots} layout="vertical" margin={{ top: 6, right: 8, left: 16, bottom: 0 }}>
                <ReferenceLine x={0} stroke={GRID_BASELINE} />
                <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} />
                <YAxis type="category" dataKey="name" width={130} tick={AXIS_TICK} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number | string | undefined) => [Math.round(coerceNumber(value)), "Restarts"]}
                />
                <Bar dataKey="restarts">
                  {restartHotspots.map((row) => (
                    <Cell key={row.name} fill={row.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No restart hotspot data available." />
          )}
        </ChartCard>

        <ChartCard title="API Response Class Mix" subtitle="2xx, 3xx, 4xx, and 5xx totals from API observability.">
          {apiStatusMix.total > 0 ? (
            <div className="space-y-3 pt-1">
              <StackBar label="2xx" value={apiStatusMix.ok} total={apiStatusMix.total} color={ACCENT} />
              <StackBar label="3xx" value={apiStatusMix.redirect} total={apiStatusMix.total} color={BLUE} />
              <StackBar label="4xx" value={apiStatusMix.clientError} total={apiStatusMix.total} color={AMBER} />
              <StackBar label="5xx" value={apiStatusMix.serverError} total={apiStatusMix.total} color={RED} />
              <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300">
                Total responses observed: <span className="font-semibold text-zinc-100">{apiStatusMix.total}</span>
              </div>
            </div>
          ) : (
            <EmptyChart message="No API status metrics available." />
          )}
        </ChartCard>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="surface p-5">
          <h3 className="text-sm font-semibold text-zinc-100">Top Risk Pods</h3>
          <p className="text-xs text-zinc-400 mt-1">Highest restart pressure.</p>
          <div className="mt-3">
            {topRiskPods.map((pod, index) => (
              <div
                key={pod.id}
                className={`flex items-center justify-between py-2.5 gap-3 ${index > 0 ? "border-t border-[#1f1f1f]" : ""}`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-mono font-semibold text-[#e8e8e8] truncate">{pod.name}</p>
                  <p className="text-[11px] font-mono text-[#444444] mt-0.5">
                    {pod.namespace} | {pod.status}
                  </p>
                </div>
                <span
                  className={`text-xs font-mono font-semibold flex-shrink-0 ${restartCountColorClass(pod.restarts)}`}
                >
                  {pod.restarts}r
                </span>
              </div>
            ))}
            {topRiskPods.length === 0 && <p className="text-sm text-zinc-400">No pod risk signals yet.</p>}
          </div>
        </div>

        <div className="surface p-5">
          <h3 className="text-sm font-semibold text-zinc-100">Recent Events</h3>
          <p className="text-xs text-zinc-400 mt-1">Latest {Math.min(events.length, 8)} items.</p>
          <div className="mt-3">
            {events.slice(0, 8).map((event, index) => (
              <div
                key={`${event.reason}-${index}`}
                className={`flex items-start justify-between py-2.5 gap-3 ${index > 0 ? "border-t border-[#1f1f1f]" : ""}`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-mono font-semibold text-[#e8e8e8]">{event.reason}</p>
                  <p className="text-[11px] font-mono text-[#444444] mt-0.5 leading-relaxed line-clamp-2">
                    {event.message}
                  </p>
                </div>
                <span className="text-[11px] font-mono text-[#666666] flex-shrink-0">{event.age}</span>
              </div>
            ))}
            {events.length === 0 && <p className="text-sm text-zinc-400">No recent events available.</p>}
          </div>
        </div>

        <div className="surface p-5">
          <h3 className="text-sm font-semibold text-zinc-100">Health Snapshot</h3>
          <p className="text-xs text-zinc-400 mt-1">At-a-glance diagnostics state.</p>
          {diagnostics ? (
            <div className="mt-3">
              {[
                {
                  label: "Health Score",
                  value: `${diagnostics.healthScore}/100`,
                  critical: diagnostics.healthScore < 75,
                },
                {
                  label: "Critical",
                  value: String(diagnostics.criticalIssues),
                  critical: diagnostics.criticalIssues > 0,
                },
                { label: "Warnings", value: String(diagnostics.warningIssues), critical: false },
              ].map((item, index) => (
                <div
                  key={item.label}
                  className={`flex items-center justify-between py-2.5 gap-3 ${index > 0 ? "border-t border-[#1f1f1f]" : ""}`}
                >
                  <span className="text-[11px] font-mono text-[#444444]">{item.label}</span>
                  <span
                    className={`text-xs font-mono font-semibold ${item.critical ? "text-[#ff4444]" : "text-[#e8e8e8]"}`}
                  >
                    {item.value}
                  </span>
                </div>
              ))}
              <div className="mt-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">Health Trend</p>
                <div className="mt-2 h-1 rounded-none bg-zinc-700 overflow-hidden">
                  <div
                    className="h-full rounded-none bg-[#3b82f6]"
                    style={{ width: `${Math.max(0, Math.min(100, diagnostics.healthScore))}%` }}
                  />
                </div>
              </div>
              <p className="text-xs text-zinc-500 mt-3">Updated: {formatTimestamp(diagnostics.timestamp)}</p>
            </div>
          ) : (
            <p className="text-sm text-zinc-400 mt-3">Diagnostics data unavailable.</p>
          )}
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
                    <p className="text-sm text-zinc-500">
                      No findings reported. System diagnostics are currently clean.
                    </p>
                  )}
                </div>
              </section>
            </div>

            <details className="mt-4 rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Raw narrative
              </summary>
              <pre className="mt-3 whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">
                {diagnostics.summary}
              </pre>
            </details>
          </>
        ) : (
          <p className="text-sm text-zinc-400 mt-3">Diagnostics data unavailable.</p>
        )}
      </section>
    </div>
  );
}

function RiskRail({ label, value }: { label: string; value: number }) {
  const color = riskColor(value);

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
        <p className="text-sm font-semibold text-zinc-100">{value.toFixed(1)}%</p>
      </div>
      <div className="mt-3 h-1 rounded-none bg-zinc-700 overflow-hidden">
        <div
          className="h-full rounded-none"
          style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="surface p-5">
      <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
      <p className="text-xs text-zinc-400 mt-1">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[320px] flex items-center justify-center rounded-md border border-dashed border-zinc-700 text-sm text-zinc-500">
      {message}
    </div>
  );
}

function StackBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const ratio = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <p className="font-semibold text-zinc-300">{label}</p>
        <p className="text-zinc-500">
          {value} ({ratio.toFixed(1)}%)
        </p>
      </div>
      <div className="mt-1.5 h-1.5 rounded-none bg-zinc-700 overflow-hidden">
        <div
          className="h-full rounded-none"
          style={{ width: `${Math.max(0, Math.min(100, ratio))}%`, backgroundColor: color }}
        />
      </div>
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
  const severityColor = severity === "critical" ? RED : severity === "warning" ? AMBER : BLUE;

  return (
    <article className="pl-3 border-l-2 py-2" style={{ borderLeftColor: severityColor }}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono font-semibold uppercase" style={{ color: severityColor }}>
          {severity}
        </span>
        <p className="text-xs font-mono font-semibold text-[#e8e8e8]">{title}</p>
        {resource && <span className="text-[11px] font-mono text-[#444444]">{resource}</span>}
      </div>
      <p className="mt-1 text-xs font-mono text-[#666666] leading-relaxed">{details}</p>
      <p className="mt-1 text-[11px] font-mono text-[#666666]">-&gt; {recommendation}</p>
    </article>
  );
}

function PodLifecycleMix({ data }: { data: Array<{ name: string; value: number; color: string }> }) {
  const total = data.reduce((sum, row) => sum + row.value, 0);
  if (total === 0) {
    return <EmptyChart message="No pod lifecycle data." />;
  }

  const rows = normalizeLifecycleRows(data);
  const runningCount = lifecycleCount(rows, "running");
  const pendingCount = lifecycleCount(rows, "pending");
  const failedCount = lifecycleCount(rows, "failed");
  const succeededCount = lifecycleCount(rows, "succeeded");
  const healthyPercent = percentage(runningCount, total);
  const atRiskCount = pendingCount + failedCount;
  const atRiskPercent = percentage(atRiskCount, total);
  const dominant = [...rows].sort((a, b) => b.value - a.value)[0];

  return (
    <div className="h-[320px] flex flex-col py-1">
      <div className="rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#555555]">Live Distribution</p>
          <p className="text-[11px] font-mono text-[#888888]">
            Dominant: <span className="text-[#e8e8e8]">{dominant.name}</span>{" "}
            {percentage(dominant.value, total).toFixed(0)}%
          </p>
        </div>
        <div className="mt-2 h-2 bg-[#1f1f1f] overflow-hidden flex">
          {rows.map((row) => {
            const pct = percentage(row.value, total);
            return (
              <div
                key={`mix-segment-${row.name}`}
                className="h-full transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: row.color, minWidth: row.value > 0 ? "2px" : "0px" }}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3 flex-1 min-h-0">
        <div className="space-y-2">
          {rows.map((row) => {
            const pct = percentage(row.value, total);
            return (
              <article key={row.name} className="rounded-md border border-zinc-800 bg-zinc-900/45 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-mono text-[#666666] flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full border"
                      style={{
                        backgroundColor: row.value > 0 ? row.color : "transparent",
                        borderColor: row.value > 0 ? row.color : "#3f3f46",
                      }}
                    />
                    {row.name}
                  </p>
                  <p className="text-xs font-mono">
                    <span className="font-semibold text-[#e8e8e8]">{row.value}</span>
                    <span className="text-[#555555] ml-2">{pct.toFixed(0)}%</span>
                  </p>
                </div>
                <div className="mt-1.5 h-1.5 bg-[#1f1f1f] overflow-hidden">
                  <div
                    className="h-full transition-all duration-300"
                    style={{ width: `${pct}%`, backgroundColor: row.color }}
                  />
                </div>
              </article>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 content-start">
          <LifecycleMiniStat label="Total" value={String(total)} tone="neutral" />
          <LifecycleMiniStat label="Healthy" value={`${healthyPercent.toFixed(0)}%`} tone="good" />
          <LifecycleMiniStat label="At Risk" value={String(atRiskCount)} tone="bad" />
          <LifecycleMiniStat
            label="Succeeded"
            value={String(succeededCount)}
            tone={succeededCount > 0 ? "good" : "neutral"}
          />
          <div className="col-span-2 rounded-md border border-zinc-800 bg-zinc-900/45 px-2.5 py-2">
            <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#555555]">Operational Signal</p>
            <p className={`mt-1 text-xs font-mono ${lifecycleSignalTone(atRiskPercent)}`}>
              {atRiskPercent >= 30
                ? "High pod lifecycle risk detected."
                : atRiskPercent >= 10
                  ? "Watch pending and failed pod pressure."
                  : "Lifecycle mix is within normal operating bounds."}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-[#1f1f1f] grid grid-cols-3 gap-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#444444]">Running</p>
          <p className="mt-1 text-lg font-mono font-semibold text-[#00d4a8]">{runningCount}</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#444444]">Pending</p>
          <p className="mt-1 text-lg font-mono font-semibold text-[#f59e0b]">{pendingCount}</p>
        </div>
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#444444]">Failed</p>
          <p className="mt-1 text-lg font-mono font-semibold text-[#ff4444]">{failedCount}</p>
        </div>
      </div>
    </div>
  );
}

function LifecycleMiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "good" | "bad" | "info";
}) {
  const valueClass =
    tone === "good"
      ? "text-[#00d4a8]"
      : tone === "bad"
        ? "text-[#ff4444]"
        : tone === "info"
          ? "text-[#3b82f6]"
          : "text-[#e8e8e8]";

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/45 px-2.5 py-2">
      <p className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#555555]">{label}</p>
      <p className={`mt-1 text-sm font-mono font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}

function lifecycleSignalTone(atRiskPercent: number): string {
  if (atRiskPercent >= 30) {
    return "text-[#ff4444]";
  }
  if (atRiskPercent >= 10) {
    return "text-[#f59e0b]";
  }
  return "text-[#00d4a8]";
}

function normalizeLifecycleRows(
  data: Array<{ name: string; value: number; color: string }>,
): Array<{ name: string; value: number; color: string }> {
  const defaults = [
    { name: "Running", color: ACCENT },
    { name: "Pending", color: AMBER },
    { name: "Failed", color: RED },
    { name: "Succeeded", color: MUTED },
  ];

  return defaults.map((item) => ({
    name: item.name,
    color: item.color,
    value: data.find((row) => row.name.toLowerCase() === item.name.toLowerCase())?.value ?? 0,
  }));
}

function lifecycleCount(data: Array<{ name: string; value: number }>, target: string): number {
  return data.find((row) => row.name.toLowerCase() === target)?.value ?? 0;
}

function buildPrioritizedIssues(diagnostics: DiagnosticsResult | null) {
  if (!diagnostics) {
    return [];
  }

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return [...diagnostics.issues].sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 8);
}

function buildPodMixData(stats: ClusterStats | null): Array<{ name: string; value: number; color: string }> {
  if (!stats || stats.pods.total === 0) {
    return [];
  }

  const succeeded = Math.max(stats.pods.total - stats.pods.running - stats.pods.pending - stats.pods.failed, 0);
  return [
    { name: "Running", value: stats.pods.running, color: ACCENT },
    { name: "Pending", value: stats.pods.pending, color: AMBER },
    { name: "Failed", value: stats.pods.failed, color: RED },
    { name: "Succeeded", value: succeeded, color: MUTED },
  ];
}

function buildNodeUsageBars(nodes: Node[]): Array<{ name: string; cpu: number; memory: number }> {
  return nodes.slice(0, 8).map((node) => ({
    name: compactLabel(node.name),
    cpu: parsePercentNumber(node.cpuUsage),
    memory: parsePercentNumber(node.memUsage),
  }));
}

function buildNodeCPUTrend(nodes: Node[]): Array<{ time: string; value: number }> {
  const pointCount = nodes.reduce((max, node) => Math.max(max, node.cpuHistory?.length ?? 0), 0);
  if (pointCount === 0) {
    return [];
  }

  const rows: Array<{ time: string; value: number }> = [];
  for (let i = 0; i < pointCount; i++) {
    let total = 0;
    let count = 0;
    let label = "";

    for (const node of nodes) {
      const point = node.cpuHistory?.[i];
      if (!point) {
        continue;
      }
      total += point.value;
      count++;
      if (!label && point.time) {
        label = point.time;
      }
    }

    if (count > 0) {
      rows.push({
        time: label || `T${i + 1}`,
        value: Number((total / count).toFixed(2)),
      });
    }
  }

  return rows;
}

function buildRestartHotspots(pods: Pod[]): Array<{ name: string; restarts: number; color: string }> {
  return [...pods]
    .sort((a, b) => b.restarts - a.restarts)
    .slice(0, 7)
    .map((pod) => ({
      name: compactLabel(pod.name),
      restarts: pod.restarts,
      color: restartSeverityColor(pod.restarts),
    }));
}

function buildEventReasonBars(events: K8sEvent[]): Array<{ name: string; count: number }> {
  const byReason = new Map<string, number>();
  for (const event of events) {
    const reason = (event.reason || "Unknown").trim() || "Unknown";
    byReason.set(reason, (byReason.get(reason) ?? 0) + (event.count && event.count > 0 ? event.count : 1));
  }

  return [...byReason.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name: compactLabel(name), count }));
}

function buildAPIStatusMix(metrics: ApiMetricsSnapshot | null) {
  if (!metrics) {
    return { ok: 0, redirect: 0, clientError: 0, serverError: 0, total: 0 };
  }

  const ok = metrics.routes.reduce((sum, route) => sum + route.status2xx, 0);
  const redirect = metrics.routes.reduce((sum, route) => sum + route.status3xx, 0);
  const clientError = metrics.routes.reduce((sum, route) => sum + route.status4xx, 0);
  const serverError = metrics.routes.reduce((sum, route) => sum + route.status5xx, 0);
  return { ok, redirect, clientError, serverError, total: ok + redirect + clientError + serverError };
}

function parsePercentNumber(value: string): number {
  const numeric = Number.parseFloat(value.replace("%", ""));
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Number(Math.max(0, Math.min(100, numeric)).toFixed(2));
}

function coerceNumber(value: number | string | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function percentage(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) {
    return 0;
  }
  return Number(((part / whole) * 100).toFixed(2));
}

function compactLabel(value: string): string {
  if (value.length <= 20) {
    return value;
  }
  return `${value.slice(0, 17)}...`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function riskColor(value: number): string {
  if (value > 20) {
    return RED;
  }
  if (value > 5) {
    return AMBER;
  }
  return ACCENT;
}

function restartSeverityColor(restarts: number): string {
  if (restarts > 10) {
    return RED;
  }
  if (restarts >= 3) {
    return AMBER;
  }
  return "#666666";
}

function restartCountColorClass(restarts: number): string {
  if (restarts > 10) {
    return "text-[#ff4444]";
  }
  if (restarts >= 3) {
    return "text-[#f59e0b]";
  }
  return "text-[#666666]";
}
