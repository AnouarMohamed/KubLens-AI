import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import type { ApiMetricsSnapshot, ClusterStats, Node, Pod } from "../../../types";
import {
  buildAPIStatusStack,
  buildAPIStatusTotals,
  buildNodeCPUTrend,
  buildNodeUtilizationBars,
  buildPodLifecycleBars,
  buildRestartBands,
  buildRoutePerformance,
  buildSlowRoutes,
  buildTopPodPressure,
  percentage,
} from "../utils";

export type AnalyticsTab = "cluster" | "workloads" | "api";

interface MetricsKpi {
  label: string;
  value: string;
}

/**
 * State and derived datasets for the metrics view.
 */
interface UseMetricsDataResult {
  stats: ClusterStats | null;
  nodes: Node[];
  pods: Pod[];
  apiMetrics: ApiMetricsSnapshot | null;
  isLoading: boolean;
  autoRefresh: boolean;
  tab: AnalyticsTab;
  error: string | null;
  setAutoRefresh: (value: boolean) => void;
  setTab: (tab: AnalyticsTab) => void;
  load: () => Promise<void>;
  requestRatePerMinute: number;
  apiStatusTotals: { ok: number; redirect: number; clientError: number; serverError: number; total: number };
  errorRate: number;
  nodeReadiness: number;
  podStability: number;
  apiSuccess: number;
  podLifecycleBars: Array<{ name: string; value: number; color: string }>;
  nodeUtilizationBars: Array<{ name: string; cpu: number; memory: number }>;
  nodeCPUTrend: Array<{ time: string; value: number }>;
  restartBands: Array<{ name: string; value: number; color: string }>;
  podPressureBars: Array<{ name: string; score: number; cpuMilli: number; memMi: number; color: string }>;
  apiStatusStack: Array<{ name: string; ok: number; redirect: number; clientError: number; serverError: number }>;
  routePerformance: Array<{ route: string; requests: number; avgLatencyMs: number }>;
  slowRoutes: Array<{ route: string; avgLatencyMs: number; normalized: number }>;
  kpiItems: MetricsKpi[];
}

/**
 * Loads metrics dependencies and computes chart-ready datasets.
 *
 * @returns Metrics state, controls, and computed data rows.
 */
export function useMetricsData(): UseMetricsDataResult {
  const [stats, setStats] = useState<ClusterStats | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [pods, setPods] = useState<Pod[]>([]);
  const [apiMetrics, setApiMetrics] = useState<ApiMetricsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefreshState] = useState(true);
  const [tab, setTabState] = useState<AnalyticsTab>("cluster");
  const [error, setError] = useState<string | null>(null);

  const setAutoRefresh = useCallback((value: boolean) => {
    setAutoRefreshState(value);
  }, []);

  const setTab = useCallback((nextTab: AnalyticsTab) => {
    setTabState(nextTab);
  }, []);

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

  const apiSuccess = useMemo(
    () => percentage(apiStatusTotals.ok + apiStatusTotals.redirect, apiStatusTotals.total),
    [apiStatusTotals],
  );

  const podLifecycleBars = useMemo(() => buildPodLifecycleBars(stats), [stats]);
  const nodeUtilizationBars = useMemo(() => buildNodeUtilizationBars(nodes), [nodes]);
  const nodeCPUTrend = useMemo(() => buildNodeCPUTrend(nodes), [nodes]);
  const restartBands = useMemo(() => buildRestartBands(pods), [pods]);
  const podPressureBars = useMemo(() => buildTopPodPressure(pods), [pods]);
  const apiStatusStack = useMemo(() => buildAPIStatusStack(apiStatusTotals), [apiStatusTotals]);
  const routePerformance = useMemo(() => buildRoutePerformance(apiMetrics), [apiMetrics]);
  const slowRoutes = useMemo(() => buildSlowRoutes(apiMetrics), [apiMetrics]);

  const kpiItems = useMemo(
    () => [
      { label: "Cluster CPU", value: stats?.cluster.cpu ?? "-" },
      { label: "Cluster Memory", value: stats?.cluster.memory ?? "-" },
      { label: "Pods", value: String(stats?.pods.total ?? 0) },
      { label: "Req/min", value: requestRatePerMinute.toFixed(1) },
      { label: "Avg Latency", value: `${(apiMetrics?.avgLatencyMs ?? 0).toFixed(1)}ms` },
      { label: "Error Rate", value: `${errorRate.toFixed(2)}%` },
    ],
    [stats, requestRatePerMinute, apiMetrics, errorRate],
  );

  return {
    stats,
    nodes,
    pods,
    apiMetrics,
    isLoading,
    autoRefresh,
    tab,
    error,
    setAutoRefresh,
    setTab,
    load,
    requestRatePerMinute,
    apiStatusTotals,
    errorRate,
    nodeReadiness,
    podStability,
    apiSuccess,
    podLifecycleBars,
    nodeUtilizationBars,
    nodeCPUTrend,
    restartBands,
    podPressureBars,
    apiStatusStack,
    routePerformance,
    slowRoutes,
    kpiItems,
  };
}
