import type {
  ActionResult,
  AssistantReferenceFeedbackRequest,
  ApplyResourceYAMLResponse,
  AlertDispatchRequest,
  AlertDispatchResponse,
  Incident,
  IncidentStepStatusPatch,
  MemoryFixCreateRequest,
  MemoryFixPattern,
  MemoryRunbook,
  MemoryRunbookUpsertRequest,
  Postmortem,
  RemediationProposal,
  RemediationRejectRequest,
  RiskAnalyzeRequest,
  RiskReport,
  RAGTelemetry,
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
  // Callers must pass raw path fragments (not pre-encoded) to avoid double-encoding.
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
      // Backward compatibility for pre-v0.2 backends; safe to remove after v1.0.
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
  getStreamWSURL: () => buildStreamWSURL(),
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
    requestJson<ApplyResourceYAMLResponse>(apiPath("resources", kind, namespace, name, "yaml"), {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  applyResourceYAMLWithForce: (
    kind: string,
    namespace: string,
    name: string,
    payload: ResourceManifest,
    force: boolean,
  ) =>
    requestJson<ApplyResourceYAMLResponse>(
      `${apiPath("resources", kind, namespace, name, "yaml")}${force ? "?force=true" : ""}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    ),
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
  getPodLogs: (namespace: string, name: string, lines = 100, container?: string) => {
    const params = new URLSearchParams();
    if (lines > 0) {
      params.set("lines", String(lines));
    }
    if (container && container.trim() !== "") {
      params.set("container", container.trim());
    }
    const suffix = params.toString();
    return requestText(`${apiPath("pods", namespace, name, "logs")}${suffix ? `?${suffix}` : ""}`);
  },
  streamPodLogs: (
    namespace: string,
    name: string,
    lines = 50,
    container?: string,
    signal?: AbortSignal,
  ): Promise<Response> => {
    const params = new URLSearchParams();
    if (lines > 0) {
      params.set("lines", String(lines));
    }
    if (container && container.trim() !== "") {
      params.set("container", container.trim());
    }
    const suffix = params.toString();
    return fetch(`${apiPath("pods", namespace, name, "logs", "stream")}${suffix ? `?${suffix}` : ""}`, {
      credentials: "same-origin",
      signal,
    });
  },
  getPodDescribe: (namespace: string, name: string) => requestText(apiPath("pods", namespace, name, "describe")),
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
  askAssistant: (message: string, namespace?: string) =>
    requestJson<AssistantResponse>(apiPath("assistant"), {
      method: "POST",
      body: JSON.stringify({ message, namespace }),
    }),
  submitAssistantReferenceFeedback: (payload: AssistantReferenceFeedbackRequest) =>
    requestJson<ActionResult>(apiPath("assistant", "references", "feedback"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getRAGTelemetry: (limit = 24) =>
    requestJson<RAGTelemetry>(`${apiPath("rag", "telemetry")}?limit=${encodeURIComponent(String(limit))}`),
  createIncident: () =>
    requestJson<Incident>(apiPath("incidents"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  listIncidents: () => requestJson<Incident[]>(apiPath("incidents")),
  getIncident: (id: string) => requestJson<Incident>(apiPath("incidents", id)),
  updateIncidentStep: (id: string, stepID: string, payload: IncidentStepStatusPatch) =>
    requestJson<Incident>(apiPath("incidents", id, "steps", stepID), {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  resolveIncident: (id: string) =>
    requestJson<Incident>(apiPath("incidents", id, "resolve"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  generatePostmortem: (incidentID: string) =>
    requestJson<Postmortem>(apiPath("incidents", incidentID, "postmortem"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  listPostmortems: () => requestJson<Postmortem[]>(apiPath("postmortems")),
  getPostmortem: (id: string) => requestJson<Postmortem>(apiPath("postmortems", id)),
  proposeRemediation: () =>
    requestJson<RemediationProposal[]>(apiPath("remediation", "propose"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  listRemediation: () => requestJson<RemediationProposal[]>(apiPath("remediation")),
  approveRemediation: (id: string) =>
    requestJson<RemediationProposal>(apiPath("remediation", id, "approve"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  executeRemediation: (id: string) =>
    requestJson<RemediationProposal>(apiPath("remediation", id, "execute"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  rejectRemediation: (id: string, payload: RemediationRejectRequest) =>
    requestJson<RemediationProposal>(apiPath("remediation", id, "reject"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  searchMemoryRunbooks: (query = "") => {
    const suffix = query.trim() === "" ? "" : `?q=${encodeURIComponent(query.trim())}`;
    return requestJson<MemoryRunbook[]>(`${apiPath("memory", "runbooks")}${suffix}`);
  },
  createMemoryRunbook: (payload: MemoryRunbookUpsertRequest) =>
    requestJson<MemoryRunbook>(apiPath("memory", "runbooks"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateMemoryRunbook: (id: string, payload: MemoryRunbookUpsertRequest) =>
    requestJson<MemoryRunbook>(apiPath("memory", "runbooks", id), {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  listMemoryFixes: (query = "") => {
    const suffix = query.trim() === "" ? "" : `?q=${encodeURIComponent(query.trim())}`;
    return requestJson<MemoryFixPattern[]>(`${apiPath("memory", "fixes")}${suffix}`);
  },
  recordMemoryFix: (payload: MemoryFixCreateRequest) =>
    requestJson<MemoryFixPattern>(apiPath("memory", "fixes"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  analyzeRiskGuard: (payload: RiskAnalyzeRequest) =>
    requestJson<RiskReport>(apiPath("risk-guard", "analyze"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export { ApiError };

function buildStreamURL(): string {
  return apiPath("stream");
}

function buildStreamWSURL(): string {
  if (typeof window === "undefined") {
    return apiPath("stream", "ws");
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${apiPath("stream", "ws")}`;
}
