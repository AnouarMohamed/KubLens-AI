export type PodStatus = "Running" | "Pending" | "Failed" | "Succeeded" | "Terminating" | "Unknown";
export type NodeStatus = "Ready" | "NotReady" | "Unknown";
export type DiagnosticSeverity = "critical" | "warning" | "info";

export interface Pod {
  id: string;
  name: string;
  namespace: string;
  status: PodStatus;
  cpu: string;
  memory: string;
  age: string;
  restarts: number;
}

export interface K8sEvent {
  type: string;
  reason: string;
  age: string;
  // Keep backend contract field name ("from") to avoid a runtime mapping layer.
  from: string;
  message: string;
  count?: number;
  lastTimestamp?: string;
}

export interface PodDetail extends Pod {
  containers: Array<{
    name: string;
    image?: string;
    env?: Array<{ name: string; value?: string }>;
    volumeMounts?: Array<{ name: string; mountPath: string }>;
    resources?: {
      requests?: { cpu?: string; memory?: string };
      limits?: { cpu?: string; memory?: string };
    };
  }>;
  volumes?: Array<{ name: string }>;
  nodeName?: string;
  hostIP?: string;
  podIP?: string;
  events?: K8sEvent[];
  describe?: string;
}

export interface Node {
  name: string;
  status: NodeStatus;
  roles: string;
  age: string;
  version: string;
  cpuUsage: string;
  memUsage: string;
  cpuHistory?: Array<{ time: string; value: number }>;
}

export interface NodeDetail extends Node {
  capacity: {
    cpu: string;
    memory: string;
    pods: string;
  };
  allocatable: {
    cpu: string;
    memory: string;
    pods: string;
  };
  conditions: Array<{
    type: string;
    status: string;
    lastTransitionTime: string;
    reason: string;
    message: string;
  }>;
  addresses: Array<{
    type: string;
    address: string;
  }>;
}

export interface ClusterInfo {
  isRealCluster: boolean;
}

export interface ClusterContext {
  name: string;
  isRealCluster: boolean;
}

export interface ClusterContextList {
  selected: string;
  items: ClusterContext[];
}

export interface ClusterSelectResponse {
  selected: string;
}

export interface BuildInfo {
  version: string;
  commit: string;
  builtAt: string;
}

export interface RuntimeStatus {
  // Keep string fallback to tolerate forward-compatible backend modes from newer servers.
  mode: "dev" | "demo" | "prod" | string;
  devMode: boolean;
  insecure: boolean;
  isRealCluster: boolean;
  authEnabled: boolean;
  writeActionsEnabled: boolean;
  predictorEnabled: boolean;
  predictorHealthy: boolean;
  predictorLastError?: string;
  assistantEnabled: boolean;
  ragEnabled: boolean;
  alertsEnabled: boolean;
  warnings: string[];
}

export interface HealthCheck {
  name: string;
  ok: boolean;
  message: string;
  lastSuccess?: string;
  lastFailure?: string;
}

export interface HealthStatus {
  status: "ok" | "degraded" | "not-ready" | string;
  timestamp: string;
  checks: HealthCheck[];
  build: BuildInfo;
}

export interface SessionUser {
  name: string;
  role: "viewer" | "operator" | "admin";
}

export interface AuthSession {
  enabled: boolean;
  authenticated: boolean;
  user?: SessionUser;
  permissions: string[];
}

export interface ClusterStats {
  pods: { total: number; running: number; pending: number; failed: number };
  nodes: { total: number; ready: number; notReady: number };
  cluster: { cpu: string; memory: string; storage: string };
}

export interface DiagnosticIssue {
  severity: DiagnosticSeverity;
  resource?: string;
  namespace?: string;
  message: string;
  evidence?: string[];
  recommendation: string;
  source?: string;
}

export interface DiagnosticsResult {
  summary: string;
  timestamp: string;
  criticalIssues: number;
  warningIssues: number;
  healthScore: number;
  issues: DiagnosticIssue[];
}

export interface PredictionSignal {
  key: string;
  value: string;
}

export interface IncidentPrediction {
  id: string;
  resourceKind: string;
  resource: string;
  namespace?: string;
  riskScore: number;
  confidence: number;
  summary: string;
  recommendation: string;
  signals?: PredictionSignal[];
}

export interface PredictionsResult {
  source: string;
  generatedAt: string;
  items: IncidentPrediction[];
}

export interface AssistantResponse {
  answer: string;
  hints: string[];
  referencedResources: string[];
  references?: Array<{
    title: string;
    url: string;
    source: string;
    snippet?: string;
  }>;
  timestamp: string;
}

export interface ResourceRecord {
  id: string;
  name: string;
  namespace?: string;
  status: string;
  age: string;
  summary?: string;
}

export interface ResourceList {
  kind: string;
  items: ResourceRecord[];
}

export interface PodCreateRequest {
  namespace: string;
  name: string;
  image: string;
}

export interface ScaleRequest {
  replicas: number;
}

export interface ResourceManifest {
  yaml: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
}

export interface AlertDispatchRequest {
  title: string;
  message: string;
  severity?: string;
  source?: string;
  tags?: string[];
}

export interface AlertChannelResult {
  channel: string;
  success: boolean;
  error?: string;
}

export interface AlertDispatchResponse {
  success: boolean;
  results: AlertChannelResult[];
}

export interface ApiRouteMetrics {
  route: string;
  requests: number;
  errors: number;
  bytes: number;
  status2xx: number;
  status3xx: number;
  status4xx: number;
  status5xx: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
}

export interface ApiMetricsSnapshot {
  uptimeSeconds: number;
  inFlight: number;
  totalRequests: number;
  totalErrors: number;
  totalBytes: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  routes: ApiRouteMetrics[];
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  requestId?: string;
  method: string;
  path: string;
  route?: string;
  action?: string;
  status: number;
  durationMs: number;
  bytes: number;
  clientIp?: string;
  user?: string;
  role?: string;
  success: boolean;
}

export interface AuditLogResponse {
  total: number;
  items: AuditEntry[];
}

export interface StreamEvent<T = unknown> {
  type: string;
  timestamp: string;
  payload: T;
}

export type View =
  | "overview"
  | "pods"
  | "deployments"
  | "replicasets"
  | "statefulsets"
  | "daemonsets"
  | "jobs"
  | "cronjobs"
  | "services"
  | "ingresses"
  | "networkpolicies"
  | "configmaps"
  | "secrets"
  | "persistentvolumes"
  | "persistentvolumeclaims"
  | "storageclasses"
  | "nodes"
  | "namespaces"
  | "events"
  | "serviceaccounts"
  | "rbac"
  | "metrics"
  | "audit"
  | "predictions"
  | "diagnostics"
  | "assistant";
