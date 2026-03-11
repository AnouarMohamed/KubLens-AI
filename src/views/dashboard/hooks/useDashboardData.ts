import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import type { ApiMetricsSnapshot, ClusterStats, DiagnosticsResult, K8sEvent, Node, Pod } from "../../../types";
import {
  buildAPIStatusMix,
  buildEventReasonBars,
  buildNodeCPUTrend,
  buildNodeUsageBars,
  buildPodMixData,
  buildPrioritizedIssues,
  buildRestartHotspots,
  percentage,
} from "../utils";

interface DashboardKpi {
  label: string;
  value: string;
  critical: boolean;
}

/**
 * Dashboard data dependencies and derived chart datasets.
 */
interface UseDashboardDataResult {
  stats: ClusterStats | null;
  diagnostics: DiagnosticsResult | null;
  events: K8sEvent[];
  nodes: Node[];
  pods: Pod[];
  apiMetrics: ApiMetricsSnapshot | null;
  isLoading: boolean;
  error: string | null;
  load: () => Promise<void>;
  topRiskPods: Pod[];
  prioritizedIssues: DiagnosticsResult["issues"];
  podMixData: Array<{ name: string; value: number; color: string }>;
  nodeUsageBars: Array<{ name: string; cpu: number; memory: number }>;
  nodeCPUTrend: Array<{ time: string; value: number }>;
  restartHotspots: Array<{ name: string; restarts: number; color: string }>;
  eventReasonBars: Array<{ name: string; count: number }>;
  apiStatusMix: {
    ok: number;
    redirect: number;
    clientError: number;
    serverError: number;
    total: number;
  };
  pendingRate: number;
  failedRate: number;
  notReadyRate: number;
  nodeAvailabilityPercent: number;
  kpis: DashboardKpi[];
}

/**
 * Loads dashboard source data and computes all derived view models.
 *
 * @returns Dashboard state, loaders, and chart-friendly computed rows.
 */
export function useDashboardData(): UseDashboardDataResult {
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

  return {
    stats,
    diagnostics,
    events,
    nodes,
    pods,
    apiMetrics,
    isLoading,
    error,
    load,
    topRiskPods,
    prioritizedIssues,
    podMixData,
    nodeUsageBars,
    nodeCPUTrend,
    restartHotspots,
    eventReasonBars,
    apiStatusMix,
    pendingRate,
    failedRate,
    notReadyRate,
    nodeAvailabilityPercent,
    kpis,
  };
}
