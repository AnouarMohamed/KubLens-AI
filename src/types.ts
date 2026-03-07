export type PodStatus = "Running" | "Pending" | "Failed" | "Succeeded" | "Unknown";
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

export interface ClusterStats {
  pods: { total: number; running: number; pending: number; failed: number };
  nodes: { total: number; ready: number; notReady: number };
  cluster: { cpu: string; memory: string; storage: string };
}

export interface DiagnosticIssue {
  severity: DiagnosticSeverity;
  title: string;
  resource?: string;
  details: string;
  recommendation: string;
}

export interface DiagnosticsResult {
  summary: string;
  timestamp: string;
  criticalIssues: number;
  warningIssues: number;
  healthScore: number;
  issues: DiagnosticIssue[];
}

export interface AssistantResponse {
  answer: string;
  hints: string[];
  referencedResources: string[];
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

export interface TerminalExecRequest {
  command: string;
  cwd?: string;
  timeoutSeconds?: number;
}

export interface TerminalExecResponse {
  command: string;
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timestamp: string;
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
  | "diagnostics"
  | "assistant"
  | "terminal";
