import type {
  ActionResult,
  AlertDispatchRequest,
  AlertDispatchResponse,
  AuditLogResponse,
  ApiMetricsSnapshot,
  AuthSession,
  AssistantResponse,
  BuildInfo,
  HealthStatus,
  RuntimeStatus,
  ClusterContextList,
  ClusterInfo,
  ClusterSelectResponse,
  ClusterStats,
  DiagnosticsResult,
  K8sEvent,
  Node,
  NodeDetail,
  Pod,
  PodCreateRequest,
  PodDetail,
  PredictionsResult,
  ResourceManifest,
  ResourceList,
  ScaleRequest,
  TerminalExecRequest,
  TerminalExecResponse,
} from "../types";

const API_PREFIX = "/api";

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function apiPath(...segments: string[]): string {
  if (segments.length === 0) {
    return API_PREFIX;
  }
  return `${API_PREFIX}/${segments.map(encodeURIComponent).join("/")}`;
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const payload = await parseJsonSafely(response);
    const message =
      typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}`;

    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

async function requestText(url: string): Promise<string> {
  const response = await fetch(url, {
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new ApiError(`Request failed with status ${response.status}`, response.status);
  }

  return response.text();
}

async function requestPredictions(force = false): Promise<PredictionsResult> {
  const suffix = force ? "?force=1" : "";
  try {
    return await requestJson<PredictionsResult>(`${apiPath("predictions")}${suffix}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return requestJson<PredictionsResult>(`${apiPath("predictive-incidents")}${suffix}`);
    }
    throw err;
  }
}

export const api = {
  login: (token: string) =>
    requestJson<AuthSession>(apiPath("auth", "login"), {
      method: "POST",
      body: JSON.stringify({ token }),
    }),
  logout: () =>
    requestJson<AuthSession>(apiPath("auth", "logout"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  getStreamURL: () => buildStreamURL(),
  getAuthSession: () => requestJson<AuthSession>(apiPath("auth", "session")),
  getClusters: () => requestJson<ClusterContextList>(apiPath("clusters")),
  selectCluster: (name: string) =>
    requestJson<ClusterSelectResponse>(apiPath("clusters", "select"), {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getVersion: () => requestJson<BuildInfo>(apiPath("version")),
  getHealth: () => requestJson<HealthStatus>(apiPath("healthz")),
  getReadiness: () => requestJson<HealthStatus>(apiPath("readyz")),
  getRuntimeStatus: () => requestJson<RuntimeStatus>(apiPath("runtime")),
  getClusterInfo: () => requestJson<ClusterInfo>(apiPath("cluster-info")),
  getApiMetrics: () => requestJson<ApiMetricsSnapshot>(apiPath("metrics")),
  dispatchAlert: (payload: AlertDispatchRequest) =>
    requestJson<AlertDispatchResponse>(apiPath("alerts", "dispatch"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  sendTestAlert: () =>
    requestJson<AlertDispatchResponse>(apiPath("alerts", "test"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  getAuditLog: (limit = 120) => requestJson<AuditLogResponse>(`${apiPath("audit")}?limit=${limit}`),
  getNamespaces: () => requestJson<string[]>(apiPath("namespaces")),
  getResources: (kind: string) => requestJson<ResourceList>(apiPath("resources", kind)),
  getResourceYAML: (kind: string, namespace: string, name: string) =>
    requestJson<ResourceManifest>(apiPath("resources", kind, namespace, name, "yaml")),
  applyResourceYAML: (kind: string, namespace: string, name: string, payload: ResourceManifest) =>
    requestJson<ActionResult>(apiPath("resources", kind, namespace, name, "yaml"), {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  scaleResource: (kind: string, namespace: string, name: string, payload: ScaleRequest) =>
    requestJson<ActionResult>(apiPath("resources", kind, namespace, name, "scale"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  restartResource: (kind: string, namespace: string, name: string) =>
    requestJson<ActionResult>(apiPath("resources", kind, namespace, name, "restart"), {
      method: "POST",
    }),
  rollbackResource: (kind: string, namespace: string, name: string) =>
    requestJson<ActionResult>(apiPath("resources", kind, namespace, name, "rollback"), {
      method: "POST",
    }),
  getEvents: () => requestJson<K8sEvent[]>(apiPath("events")),
  getPods: () => requestJson<Pod[]>(apiPath("pods")),
  createPod: (payload: PodCreateRequest) =>
    requestJson<ActionResult>(apiPath("pods"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getPodDetail: (namespace: string, name: string) => requestJson<PodDetail>(apiPath("pods", namespace, name)),
  getPodEvents: (namespace: string, name: string) =>
    requestJson<K8sEvent[]>(apiPath("pods", namespace, name, "events")),
  getPodLogs: (namespace: string, name: string) => requestText(apiPath("pods", namespace, name, "logs")),
  restartPod: (namespace: string, name: string) =>
    requestJson<ActionResult>(apiPath("pods", namespace, name, "restart"), {
      method: "POST",
    }),
  deletePod: (namespace: string, name: string) =>
    requestJson<ActionResult>(apiPath("pods", namespace, name), {
      method: "DELETE",
    }),
  getNodes: () => requestJson<Node[]>(apiPath("nodes")),
  getNodeDetail: (name: string) => requestJson<NodeDetail>(apiPath("nodes", name)),
  cordonNode: (name: string) =>
    requestJson<ActionResult>(apiPath("nodes", name, "cordon"), {
      method: "POST",
    }),
  getStats: () => requestJson<ClusterStats>(apiPath("stats")),
  getDiagnostics: () => requestJson<DiagnosticsResult>(apiPath("diagnostics")),
  getPredictions: (force = false) => requestPredictions(force),
  askAssistant: (message: string) =>
    requestJson<AssistantResponse>(apiPath("assistant"), {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  execTerminal: (payload: TerminalExecRequest) =>
    requestJson<TerminalExecResponse>(apiPath("terminal", "exec"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export { ApiError };

function buildStreamURL(): string {
  return apiPath("stream");
}
