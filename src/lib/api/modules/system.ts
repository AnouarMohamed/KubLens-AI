import type {
  ApiMetricsSnapshot,
  BuildInfo,
  ClusterInfo,
  ClusterStats,
  DiagnosticsResult,
  HealthStatus,
  PredictionsResult,
  RuntimeStatus,
} from "../../../types";
import { apiPath, requestJson, requestPredictions } from "../core";

export const systemApi = {
  getVersion: () => requestJson<BuildInfo>(apiPath("version")),
  getHealth: () => requestJson<HealthStatus>(apiPath("healthz")),
  getReadiness: () => requestJson<HealthStatus>(apiPath("readyz")),
  getRuntimeStatus: () => requestJson<RuntimeStatus>(apiPath("runtime")),
  getClusterInfo: () => requestJson<ClusterInfo>(apiPath("cluster-info")),
  getApiMetrics: () => requestJson<ApiMetricsSnapshot>(apiPath("metrics")),
  getStats: () => requestJson<ClusterStats>(apiPath("stats")),
  getDiagnostics: () => requestJson<DiagnosticsResult>(apiPath("diagnostics")),
  getPredictions: (force = false): Promise<PredictionsResult> => requestPredictions(force),
};
