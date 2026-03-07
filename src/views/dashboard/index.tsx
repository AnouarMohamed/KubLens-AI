import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../../lib/api";
import type { ApiMetricsSnapshot, ClusterStats, DiagnosticsResult, K8sEvent, Node, Pod } from "../../types";

const DOCKER_BLUE = "#2496ed";
const CHART_BLUE = "#4f7bff";
const CHART_GREEN = "#34c759";
const CHART_AMBER = "#eab308";
const CHART_MAGENTA = "#d946ef";
const CHART_SLATE = "#a9b4cc";
const TOOLTIP_STYLE = { background: "#ffffff", border: "1px solid #d8dde6", color: "#1f2937" };

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
      const [statsResponse, diagnosticsResponse, eventsResponse, nodesResponse, podsResponse, apiMetricsResponse] = await Promise.all([
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

  return (
    <div className="space-y-6">
      <header className="surface p-6 text-zinc-100">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">Operations Overview</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100">Cluster Command Deck</h2>
            <p className="text-sm text-zinc-300 mt-2 max-w-2xl">
              Deeper telemetry with comparative, trend, and hotspot charts for faster decisions.
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={isLoading}
            className="h-10 rounded-xl border border-zinc-600 px-4 text-sm font-medium text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
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

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RiskRail label="Pending Pod Rate" value={pendingRate} tone="warning" />
        <RiskRail label="Failed Pod Rate" value={failedRate} tone="critical" />
        <RiskRail label="NotReady Node Rate" value={notReadyRate} tone="info" />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Pod Lifecycle Mix" subtitle="Composition of running, pending, failed, and succeeded pods.">
          {podMixData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={podMixData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={68}
                  outerRadius={118}
                  paddingAngle={1}
                  labelLine={false}
                  label={renderCompactLabel}
                  stroke="#d8dde6"
                  strokeWidth={2}
                >
                  {podMixData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [value, "Pods"]} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No pod lifecycle data available." />
          )}
        </ChartCard>

        <ChartCard title="Node Utilization" subtitle="CPU and memory percentage by node (top 8).">
          {nodeUsageBars.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={nodeUsageBars} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#d8dde6" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#5d6674", fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={48} />
                <YAxis domain={[0, 100]} tick={{ fill: "#5d6674", fontSize: 12 }} unit="%" />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, key: string) => [`${value.toFixed(1)}%`, key === "cpu" ? "CPU" : "Memory"]}
                />
                <Bar dataKey="cpu" fill={CHART_BLUE} radius={[4, 4, 0, 0]} />
                <Bar dataKey="memory" fill={CHART_GREEN} radius={[4, 4, 0, 0]} />
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
                <CartesianGrid stroke="#d8dde6" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="time" tick={{ fill: "#5d6674", fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#5d6674", fontSize: 12 }} unit="%" />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [`${value.toFixed(1)}%`, "Avg CPU"]} />
                <Line type="monotone" dataKey="value" stroke={DOCKER_BLUE} strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 4 }} />
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
                <CartesianGrid stroke="#d8dde6" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#5d6674", fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={48} />
                <YAxis allowDecimals={false} tick={{ fill: "#5d6674", fontSize: 12 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [value, "Events"]} />
                <Bar dataKey="count" fill={CHART_AMBER} radius={[4, 4, 0, 0]} />
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
                <CartesianGrid stroke="#d8dde6" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: "#5d6674", fontSize: 12 }} />
                <YAxis type="category" dataKey="name" width={130} tick={{ fill: "#5d6674", fontSize: 12 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [value, "Restarts"]} />
                <Bar dataKey="restarts" radius={[0, 4, 4, 0]}>
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
              <StackBar
                label="2xx"
                value={apiStatusMix.ok}
                total={apiStatusMix.total}
                color={CHART_GREEN}
              />
              <StackBar
                label="3xx"
                value={apiStatusMix.redirect}
                total={apiStatusMix.total}
                color={CHART_BLUE}
              />
              <StackBar
                label="4xx"
                value={apiStatusMix.clientError}
                total={apiStatusMix.total}
                color={CHART_AMBER}
              />
              <StackBar
                label="5xx"
                value={apiStatusMix.serverError}
                total={apiStatusMix.total}
                color={CHART_MAGENTA}
              />
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
          <p className="text-xs text-zinc-400 mt-1">Latest {Math.min(events.length, 8)} items.</p>
          <div className="mt-3 space-y-2">
            {events.slice(0, 8).map((event, index) => (
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

        <div className="surface p-5">
          <h3 className="text-sm font-semibold text-zinc-100">Health Snapshot</h3>
          <p className="text-xs text-zinc-400 mt-1">At-a-glance diagnostics state.</p>
          {diagnostics ? (
            <div className="mt-4 space-y-3">
              <MiniMetric label="Health Score" value={`${diagnostics.healthScore}/100`} />
              <MiniMetric label="Critical" value={String(diagnostics.criticalIssues)} />
              <MiniMetric label="Warnings" value={String(diagnostics.warningIssues)} />
              <div>
                <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">Health Trend</p>
                <div className="mt-2 h-2 rounded-full bg-zinc-700 overflow-hidden">
                  <div className="h-full bg-[#4f7bff]" style={{ width: `${Math.max(0, Math.min(100, diagnostics.healthScore))}%` }} />
                </div>
              </div>
              <p className="text-xs text-zinc-500">Updated: {formatTimestamp(diagnostics.timestamp)}</p>
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

function RiskRail({ label, value, tone }: { label: string; value: number; tone: "critical" | "warning" | "info" }) {
  const color = tone === "critical" ? CHART_MAGENTA : tone === "warning" ? CHART_AMBER : CHART_BLUE;

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
        <p className="text-sm font-semibold text-zinc-100">{value.toFixed(1)}%</p>
      </div>
      <div className="mt-3 h-2 rounded-full bg-zinc-700 overflow-hidden">
        <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
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
        <p className="text-zinc-500">{value} ({ratio.toFixed(1)}%)</p>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-zinc-700 overflow-hidden">
        <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, ratio))}%`, backgroundColor: color }} />
      </div>
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

function buildPodMixData(stats: ClusterStats | null): Array<{ name: string; value: number; color: string }> {
  if (!stats || stats.pods.total === 0) {
    return [];
  }

  const succeeded = Math.max(stats.pods.total - stats.pods.running - stats.pods.pending - stats.pods.failed, 0);
  return [
    { name: "Running", value: stats.pods.running, color: CHART_BLUE },
    { name: "Pending", value: stats.pods.pending, color: CHART_AMBER },
    { name: "Failed", value: stats.pods.failed, color: CHART_MAGENTA },
    { name: "Succeeded", value: succeeded, color: CHART_GREEN },
  ].filter((row) => row.value > 0);
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
    .map((pod, index) => ({
      name: compactLabel(pod.name),
      restarts: pod.restarts,
      color: [CHART_MAGENTA, CHART_AMBER, CHART_BLUE, CHART_GREEN, CHART_SLATE][index % 5],
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

function renderCompactLabel({ name, percent }: { name?: string | number; percent?: number }) {
  if (!name || !percent || percent < 0.06) {
    return "";
  }
  return `${name} ${(percent * 100).toFixed(0)}%`;
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

