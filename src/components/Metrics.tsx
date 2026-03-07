import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/api";
import type { ApiMetricsSnapshot, ClusterStats, Node, Pod } from "../types";

const DOCKER_BLUE = "#2496ed";
const CHART_BLUE = "#4f7bff";
const CHART_GREEN = "#34c759";
const CHART_AMBER = "#eab308";
const CHART_MAGENTA = "#d946ef";
const CHART_SLATE = "#a9b4cc";
const CHART_COLORS = [CHART_BLUE, CHART_GREEN, CHART_AMBER, CHART_MAGENTA, CHART_SLATE, DOCKER_BLUE];
const TOOLTIP_STYLE = { background: "#ffffff", border: "1px solid #d8dde6", color: "#1f2937" };
const GRID_STROKE = "#d8dde6";

type AnalyticsTab = "cluster" | "workloads" | "api";

export default function Metrics() {
  const [stats, setStats] = useState<ClusterStats | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [pods, setPods] = useState<Pod[]>([]);
  const [apiMetrics, setApiMetrics] = useState<ApiMetricsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [tab, setTab] = useState<AnalyticsTab>("cluster");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statsPayload, nodesPayload, podsPayload, metricsPayload] = await Promise.all([
        api.getStats(),
        api.getNodes(),
        api.getPods(),
        api.getApiMetrics(),
      ]);
      setStats(statsPayload);
      setNodes(nodesPayload);
      setPods(podsPayload);
      setApiMetrics(metricsPayload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const handle = window.setInterval(() => {
      void load();
    }, 15000);

    return () => window.clearInterval(handle);
  }, [autoRefresh, load]);

  const requestRatePerMinute = useMemo(() => {
    if (!apiMetrics || apiMetrics.uptimeSeconds <= 0) {
      return 0;
    }
    return (apiMetrics.totalRequests / apiMetrics.uptimeSeconds) * 60;
  }, [apiMetrics]);

  const apiStatusTotals = useMemo(() => buildAPIStatusTotals(apiMetrics), [apiMetrics]);
  const errorRate = useMemo(() => {
    if (!apiMetrics || apiMetrics.totalRequests === 0) {
      return 0;
    }
    return (apiMetrics.totalErrors / apiMetrics.totalRequests) * 100;
  }, [apiMetrics]);

  const nodeReadiness = useMemo(() => {
    if (!stats) {
      return 0;
    }
    return percentage(stats.nodes.ready, stats.nodes.total);
  }, [stats]);

  const podStability = useMemo(() => {
    if (!stats) {
      return 0;
    }
    const succeeded = Math.max(stats.pods.total - stats.pods.running - stats.pods.pending - stats.pods.failed, 0);
    return percentage(stats.pods.running + succeeded, stats.pods.total);
  }, [stats]);

  const apiSuccess = useMemo(() => percentage(apiStatusTotals.ok + apiStatusTotals.redirect, apiStatusTotals.total), [apiStatusTotals]);

  const podLifecycleBars = useMemo(() => buildPodLifecycleBars(stats), [stats]);
  const nodeUtilizationBars = useMemo(() => buildNodeUtilizationBars(nodes), [nodes]);
  const nodeCPUTrend = useMemo(() => buildNodeCPUTrend(nodes), [nodes]);
  const restartBands = useMemo(() => buildRestartBands(pods), [pods]);
  const podPressureBars = useMemo(() => buildTopPodPressure(pods), [pods]);
  const apiStatusStack = useMemo(() => buildAPIStatusStack(apiStatusTotals), [apiStatusTotals]);
  const routePerformance = useMemo(() => buildRoutePerformance(apiMetrics), [apiMetrics]);
  const slowRoutes = useMemo(() => buildSlowRoutes(apiMetrics), [apiMetrics]);

  return (
    <div className="space-y-6">
      <header className="surface p-6 text-zinc-100">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Operations Metrics</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Cluster Telemetry</h2>
            <p className="text-sm text-zinc-300 mt-2 max-w-2xl">
              Charts are selected by data semantics: trends use lines, comparisons use grouped bars, and composition uses stacked bars.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-zinc-300 rounded-xl border border-zinc-700 px-3 py-2 bg-zinc-800/50">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(event) => setAutoRefresh(event.target.checked)}
              />
              Auto refresh (15s)
            </label>
            <button
              onClick={() => void load()}
              disabled={isLoading}
              className="h-10 rounded-xl border border-zinc-700 px-4 text-sm font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
            >
              {isLoading ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      {error && <div className="rounded-xl border border-zinc-700 bg-zinc-900/85 px-3 py-2 text-sm text-zinc-200">{error}</div>}

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <SignalCard
          label="Node Readiness"
          value={`${nodeReadiness.toFixed(1)}%`}
          detail={`${stats?.nodes.ready ?? 0}/${stats?.nodes.total ?? 0} nodes ready`}
          fill={nodeReadiness}
        />
        <SignalCard
          label="Pod Stability"
          value={`${podStability.toFixed(1)}%`}
          detail={`${stats?.pods.failed ?? 0} failed pods`}
          fill={podStability}
        />
        <SignalCard
          label="API Success"
          value={`${apiSuccess.toFixed(1)}%`}
          detail={`${apiStatusTotals.serverError} server errors`}
          fill={apiSuccess}
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <MetricCard label="Cluster CPU" value={stats?.cluster.cpu ?? "-"} />
        <MetricCard label="Cluster Memory" value={stats?.cluster.memory ?? "-"} />
        <MetricCard label="Pods" value={String(stats?.pods.total ?? 0)} />
        <MetricCard label="Req/min" value={requestRatePerMinute.toFixed(1)} />
        <MetricCard label="Avg Latency" value={`${(apiMetrics?.avgLatencyMs ?? 0).toFixed(1)}ms`} />
        <MetricCard label="Error Rate" value={`${errorRate.toFixed(2)}%`} />
      </section>

      <section className="surface p-4">
        <div className="flex flex-wrap items-center gap-2">
          <TabButton label="Cluster" active={tab === "cluster"} onClick={() => setTab("cluster")} />
          <TabButton label="Workloads" active={tab === "workloads"} onClick={() => setTab("workloads")} />
          <TabButton label="API" active={tab === "api"} onClick={() => setTab("api")} />
        </div>

        {tab === "cluster" && (
          <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="Node Utilization by Node (CPU vs Memory)">
              {nodeUtilizationBars.length > 0 ? (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={nodeUtilizationBars} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#5d6674", fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={52} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#5d6674", fontSize: 12 }} unit="%" />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === "cpu" ? "CPU" : "Memory"]} />
                    <Bar dataKey="cpu" name="CPU" fill={CHART_BLUE} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="memory" name="Memory" fill={CHART_GREEN} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No node utilization data available." />
              )}
            </ChartCard>

            <ChartCard title="Average Node CPU Trend">
              {nodeCPUTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={340}>
                  <AreaChart data={nodeCPUTrend} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: "#5d6674", fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#5d6674", fontSize: 12 }} unit="%" />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [`${value.toFixed(1)}%`, "Avg CPU"]} />
                    <Area type="monotone" dataKey="value" stroke={DOCKER_BLUE} fill={CHART_BLUE} fillOpacity={0.22} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No node CPU trend data available." />
              )}
            </ChartCard>
          </div>
        )}

        {tab === "workloads" && (
          <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4">
            <ChartCard title="Pod Lifecycle Distribution">
              {podLifecycleBars.length > 0 ? (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={podLifecycleBars} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#5d6674", fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fill: "#5d6674", fontSize: 12 }} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [value, "Pods"]} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {podLifecycleBars.map((row) => (
                        <Cell key={row.name} fill={row.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No pod lifecycle data available." />
              )}
            </ChartCard>

            <ChartCard title="Restart Pressure Bands">
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={restartBands} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#5d6674", fontSize: 12 }} interval={0} angle={-18} textAnchor="end" height={50} />
                  <YAxis allowDecimals={false} tick={{ fill: "#5d6674", fontSize: 12 }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value: number) => [value, "Pods"]} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {restartBands.map((row) => (
                      <Cell key={row.name} fill={row.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Top Pod Resource Pressure">
              {podPressureBars.length > 0 ? (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={podPressureBars} layout="vertical" margin={{ top: 6, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: "#5d6674", fontSize: 12 }} unit="%" />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fill: "#5d6674", fontSize: 12 }} />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value: number, name: string, item) => {
                        const payload = item.payload as { cpuMilli: number; memMi: number };
                        if (name === "score") {
                          return [`${value.toFixed(1)}%`, `Pressure (CPU ${payload.cpuMilli}m | Mem ${payload.memMi}Mi)`];
                        }
                        return [value, name];
                      }}
                    />
                    <Bar dataKey="score" fill={DOCKER_BLUE} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No pod pressure data available." />
              )}
            </ChartCard>
          </div>
        )}

        {tab === "api" && (
          <div className="mt-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="HTTP Status Composition (Stacked)">
              {apiStatusStack.length > 0 ? (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={apiStatusStack} layout="vertical" margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#5d6674", fontSize: 12 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#5d6674", fontSize: 12 }} width={84} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="ok" stackId="status" fill={CHART_GREEN} name="2xx" />
                    <Bar dataKey="redirect" stackId="status" fill={CHART_BLUE} name="3xx" />
                    <Bar dataKey="clientError" stackId="status" fill={CHART_AMBER} name="4xx" />
                    <Bar dataKey="serverError" stackId="status" fill={CHART_MAGENTA} name="5xx" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No HTTP status data available." />
              )}
            </ChartCard>

            <ChartCard title="Route Requests vs Latency">
              {routePerformance.length > 0 ? (
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={routePerformance} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="route" tick={{ fill: "#5d6674", fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={52} />
                    <YAxis yAxisId="requests" tick={{ fill: "#5d6674", fontSize: 12 }} allowDecimals={false} />
                    <YAxis yAxisId="latency" orientation="right" tick={{ fill: "#5d6674", fontSize: 12 }} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar yAxisId="requests" dataKey="requests" fill={CHART_BLUE} radius={[4, 4, 0, 0]} name="Requests" />
                    <Line yAxisId="latency" type="monotone" dataKey="avgLatencyMs" stroke={CHART_AMBER} strokeWidth={2} dot={{ r: 3 }} name="Avg Latency (ms)" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="No route performance data available." />
              )}
            </ChartCard>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 rounded-xl border border-zinc-700 bg-zinc-900 p-4">
          <h3 className="text-sm font-semibold text-zinc-100">API Route Details</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-800/70 text-xs uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Route</th>
                  <th className="px-3 py-2 font-semibold">Requests</th>
                  <th className="px-3 py-2 font-semibold">Errors</th>
                  <th className="px-3 py-2 font-semibold">Avg Latency</th>
                  <th className="px-3 py-2 font-semibold">Max Latency</th>
                  <th className="px-3 py-2 font-semibold">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800 text-zinc-200">
                {(apiMetrics?.routes ?? []).slice(0, 12).map((route) => (
                  <tr key={route.route} className="hover:bg-zinc-800/40">
                    <td className="px-3 py-2 font-medium">{route.route}</td>
                    <td className="px-3 py-2">{route.requests}</td>
                    <td className="px-3 py-2">{route.errors}</td>
                    <td className="px-3 py-2">{route.avgLatencyMs.toFixed(2)}ms</td>
                    <td className="px-3 py-2">{route.maxLatencyMs.toFixed(2)}ms</td>
                    <td className="px-3 py-2">{formatBytes(route.bytes)}</td>
                  </tr>
                ))}
                {(apiMetrics?.routes.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                      Route metrics are empty. Generate traffic and refresh.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
          <h3 className="text-sm font-semibold text-zinc-100">Slowest Routes</h3>
          <p className="text-xs text-zinc-400 mt-1">Average latency ranking.</p>
          <div className="mt-4 space-y-3">
            {slowRoutes.map((route, index) => (
              <div key={route.route} className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-zinc-100 truncate">{index + 1}. {route.route}</span>
                  <span className="text-zinc-300">{route.avgLatencyMs.toFixed(2)}ms</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-[#2496ed]" style={{ width: `${route.normalized}%` }} />
                </div>
              </div>
            ))}
            {slowRoutes.length === 0 && <p className="text-sm text-zinc-500">No route latency data available.</p>}
          </div>
        </section>
      </section>
    </div>
  );
}

function SignalCard({ label, value, detail, fill }: { label: string; value: string; detail: string; fill: number }) {
  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100">{value}</p>
      <p className="mt-1 text-xs text-zinc-400">{detail}</p>
      <div className="mt-3 h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div className="h-full bg-[#4f7bff]" style={{ width: `${fill}%` }} />
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
        active ? "border-[#4f7bff] bg-[#4f7bff]/18 text-zinc-100" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[340px] flex items-center justify-center rounded-md border border-dashed border-zinc-700 text-sm text-zinc-500">
      {message}
    </div>
  );
}

function buildPodLifecycleBars(stats: ClusterStats | null): Array<{ name: string; value: number; color: string }> {
  if (!stats) {
    return [];
  }

  const succeeded = Math.max(stats.pods.total - stats.pods.running - stats.pods.pending - stats.pods.failed, 0);
  return [
    { name: "Running", value: stats.pods.running, color: CHART_GREEN },
    { name: "Pending", value: stats.pods.pending, color: CHART_AMBER },
    { name: "Failed", value: stats.pods.failed, color: CHART_MAGENTA },
    { name: "Succeeded", value: succeeded, color: CHART_BLUE },
  ].filter((row) => row.value > 0);
}

function buildNodeUtilizationBars(nodes: Node[]): Array<{ name: string; cpu: number; memory: number }> {
  return nodes.slice(0, 8).map((node) => ({
    name: compactRoute(node.name),
    cpu: parsePercentValue(node.cpuUsage),
    memory: parsePercentValue(node.memUsage),
  }));
}

function buildNodeCPUTrend(nodes: Node[]): Array<{ time: string; value: number }> {
  const maxPoints = nodes.reduce((max, node) => Math.max(max, node.cpuHistory?.length ?? 0), 0);
  if (maxPoints === 0) {
    return [];
  }

  const rows: Array<{ time: string; value: number }> = [];
  for (let index = 0; index < maxPoints; index++) {
    let total = 0;
    let count = 0;
    let label = "";

    for (const node of nodes) {
      const point = node.cpuHistory?.[index];
      if (!point) {
        continue;
      }

      if (!label && point.time) {
        label = point.time;
      }
      total += Math.min(Math.max(point.value, 0), 100);
      count++;
    }

    if (count > 0) {
      rows.push({
        time: label || `T${index + 1}`,
        value: Number((total / count).toFixed(2)),
      });
    }
  }

  return rows;
}

function buildRestartBands(pods: Pod[]): Array<{ name: string; value: number; color: string }> {
  let none = 0;
  let light = 0;
  let medium = 0;
  let heavy = 0;

  for (const pod of pods) {
    if (pod.restarts >= 10) {
      heavy++;
    } else if (pod.restarts >= 5) {
      medium++;
    } else if (pod.restarts >= 1) {
      light++;
    } else {
      none++;
    }
  }

  return [
    { name: "No Restarts", value: none, color: CHART_GREEN },
    { name: "1-4", value: light, color: CHART_BLUE },
    { name: "5-9", value: medium, color: CHART_AMBER },
    { name: "10+", value: heavy, color: CHART_MAGENTA },
  ].filter((row) => row.value > 0);
}

function buildTopPodPressure(pods: Pod[]): Array<{ name: string; score: number; cpuMilli: number; memMi: number; color: string }> {
  return pods
    .map((pod) => {
      const cpuMilli = parseCPUMilli(pod.cpu);
      const memMi = parseMemoryMi(pod.memory);
      const normalizedCPU = Math.min((cpuMilli / 1000) * 100, 100);
      const normalizedMemory = Math.min((memMi / 1024) * 100, 100);

      return {
        name: compactRoute(pod.name),
        score: Number((normalizedCPU * 0.6 + normalizedMemory * 0.4).toFixed(2)),
        cpuMilli,
        memMi,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((row, index) => ({ ...row, color: CHART_COLORS[index % CHART_COLORS.length] }));
}

function buildAPIStatusTotals(metrics: ApiMetricsSnapshot | null) {
  if (!metrics) {
    return { ok: 0, redirect: 0, clientError: 0, serverError: 0, total: 0 };
  }

  const ok = metrics.routes.reduce((sum, route) => sum + route.status2xx, 0);
  const redirect = metrics.routes.reduce((sum, route) => sum + route.status3xx, 0);
  const clientError = metrics.routes.reduce((sum, route) => sum + route.status4xx, 0);
  const serverError = metrics.routes.reduce((sum, route) => sum + route.status5xx, 0);
  const total = ok + redirect + clientError + serverError;

  return { ok, redirect, clientError, serverError, total };
}

function buildAPIStatusStack(totals: { ok: number; redirect: number; clientError: number; serverError: number }) {
  if (totals.ok + totals.redirect + totals.clientError + totals.serverError === 0) {
    return [];
  }

  return [
    {
      name: "Responses",
      ok: totals.ok,
      redirect: totals.redirect,
      clientError: totals.clientError,
      serverError: totals.serverError,
    },
  ];
}

function buildRoutePerformance(metrics: ApiMetricsSnapshot | null): Array<{ route: string; requests: number; avgLatencyMs: number }> {
  if (!metrics) {
    return [];
  }

  return [...metrics.routes]
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 8)
    .map((route) => ({
      route: compactRoute(route.route),
      requests: route.requests,
      avgLatencyMs: Number(route.avgLatencyMs.toFixed(2)),
    }));
}

function buildSlowRoutes(metrics: ApiMetricsSnapshot | null): Array<{ route: string; avgLatencyMs: number; normalized: number }> {
  if (!metrics || metrics.routes.length === 0) {
    return [];
  }

  const rows = [...metrics.routes]
    .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)
    .slice(0, 6)
    .map((route) => ({ route: compactRoute(route.route), avgLatencyMs: route.avgLatencyMs }));
  const peak = Math.max(...rows.map((row) => row.avgLatencyMs), 1);

  return rows.map((row) => ({
    ...row,
    normalized: Math.max(12, (row.avgLatencyMs / peak) * 100),
  }));
}

function compactRoute(route: string): string {
  if (route.length <= 26) {
    return route;
  }
  return `${route.slice(0, 23)}...`;
}

function parsePercentValue(value: string): number {
  const num = Number.parseFloat(value.replace("%", ""));
  if (!Number.isFinite(num)) {
    return 0;
  }
  return Math.min(Math.max(num, 0), 100);
}

function parseCPUMilli(value: string): number {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "n/a") {
    return 0;
  }

  if (normalized.endsWith("m")) {
    const parsed = Number.parseFloat(normalized.slice(0, -1));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed * 1000;
}

function parseMemoryMi(value: string): number {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "n/a") {
    return 0;
  }

  if (normalized.endsWith("mi")) {
    const parsed = Number.parseFloat(normalized.slice(0, -2));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (normalized.endsWith("gi")) {
    const parsed = Number.parseFloat(normalized.slice(0, -2));
    return Number.isFinite(parsed) ? parsed * 1024 : 0;
  }

  if (normalized.endsWith("ki")) {
    const parsed = Number.parseFloat(normalized.slice(0, -2));
    return Number.isFinite(parsed) ? parsed / 1024 : 0;
  }

  const parsed = Number.parseFloat(normalized.replace(/b$/, ""));
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed / (1024 * 1024);
}

function percentage(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) {
    return 0;
  }
  return Number(((part / whole) * 100).toFixed(2));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
