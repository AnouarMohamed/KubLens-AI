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
  getApiMetrics: (signal?: AbortSignal) => requestJson<ApiMetricsSnapshot>(apiPath("metrics"), { signal }),
  getStats: (signal?: AbortSignal) => requestJson<ClusterStats>(apiPath("stats"), { signal }),
  getDiagnostics: (signal?: AbortSignal) => requestJson<DiagnosticsResult>(apiPath("diagnostics"), { signal }),
  getPredictions: (force = false): Promise<PredictionsResult> => requestPredictions(force),
};
