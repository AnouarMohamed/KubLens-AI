/**
 * Shared frontend TypeScript contracts aligned with backend JSON payloads.
 *
 * These interfaces intentionally mirror `backend/internal/model/types.go`.
 * Keep this file in sync with backend response/request shape changes.
 */
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

export interface NodeDrainPod {
  namespace: string;
  name: string;
  reason?: string;
}

export interface NodeDrainBlocker {
  kind: string;
  message: string;
  pod: NodeDrainPod;
  reference?: string;
}

export interface NodeDrainPreview {
  node: string;
  evictable: NodeDrainPod[];
  skipped: NodeDrainPod[];
  blockers: NodeDrainBlocker[];
  safeToDrain: boolean;
  generatedAt: string;
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

export type IncidentStatus = "open" | "resolved";
export type RunbookStepStatus = "pending" | "in_progress" | "done" | "skipped";
export type TimelineEntryKind = "diagnostic" | "event" | "prediction" | "action";

export interface TimelineEntry {
  timestamp: string;
  kind: TimelineEntryKind;
  source: string;
  summary: string;
  resource: string;
  severity: string;
}

export interface RunbookStep {
  id: string;
  title: string;
  description: string;
  command: string;
  status: RunbookStepStatus;
  mandatory: boolean;
}

export interface Incident {
  id: string;
  title: string;
  severity: string;
  status: IncidentStatus;
  summary: string;
  openedAt: string;
  resolvedAt: string;
  timeline: TimelineEntry[];
  runbook: RunbookStep[];
  affectedResources: string[];
  associatedRemediationIds: string[];
}

export interface IncidentStepStatusPatch {
  status: RunbookStepStatus;
}

export type RemediationKind = "restart_pod" | "cordon_node" | "rollback_deployment";

export interface RemediationProposal {
  id: string;
  kind: RemediationKind;
  status: string;
  incidentId: string;
  resource: string;
  namespace: string;
  reason: string;
  riskLevel: string;
  dryRunResult: string;
  executionResult: string;
  createdAt: string;
  updatedAt: string;
  approvedBy: string;
  approvedAt: string;
  rejectedBy: string;
  rejectedAt: string;
  rejectedReason: string;
  executedBy: string;
  executedAt: string;
}

export interface RemediationRejectRequest {
  reason: string;
}

export interface MemoryRunbook {
  id: string;
  title: string;
  tags: string[];
  description: string;
  steps: string[];
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryRunbookUpsertRequest {
  title: string;
  tags: string[];
  description: string;
  steps: string[];
}

export interface MemoryFixPattern {
  id: string;
  incidentId: string;
  proposalId: string;
  title: string;
  description: string;
  resource: string;
  kind: RemediationKind;
  recordedBy: string;
  recordedAt: string;
}

export interface MemoryFixCreateRequest {
  incidentId: string;
  proposalId: string;
  title: string;
  description: string;
  resource: string;
  kind: RemediationKind;
}

export interface RiskCheck {
  name: string;
  passed: boolean;
  detail: string;
  suggestion: string;
  score: number;
}

export interface RiskReport {
  score: number;
  level: string;
  summary: string;
  checks: RiskCheck[];
}

export interface RiskAnalyzeRequest {
  manifest: string;
}

export interface ResourceApplyRiskResponse {
  message: string;
  requiresForce: boolean;
  report: RiskReport;
}

export type PostmortemMethod = "template" | "ai";

export interface Postmortem {
  id: string;
  incidentId: string;
  incidentTitle: string;
  severity: string;
  openedAt: string;
  resolvedAt: string;
  duration: string;
  generatedAt: string;
  method: PostmortemMethod;
  rootCause: string;
  impact: string;
  prevention: string;
  timelineMarkdown: string;
  runbookMarkdown: string;
  timeline: TimelineEntry[];
  runbook: RunbookStep[];
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

export interface AssistantReferenceFeedbackRequest {
  query: string;
  url: string;
  helpful: boolean;
}

export interface RAGResultTrace {
  title: string;
  url: string;
  source: string;
  finalScore: number;
  lexicalScore: number;
  semanticScore: number;
  coverageScore: number;
  sourceBoost: number;
  feedbackBoost: number;
}

export interface RAGQueryTrace {
  timestamp: string;
  query: string;
  queryTerms: string[];
  usedSemantic: boolean;
  candidateCount: number;
  resultCount: number;
  durationMs: number;
  topResults: RAGResultTrace[];
}

export interface RAGDocFeedback {
  url: string;
  helpful: number;
  notHelpful: number;
  netScore: number;
  updatedAt: string;
}

export interface RAGTelemetry {
  enabled: boolean;
  indexedAt: string;
  expiresAt: string;
  totalQueries: number;
  emptyResults: number;
  hitRate: number;
  averageResults: number;
  feedbackSignals: number;
  positiveFeedback: number;
  negativeFeedback: number;
  topFeedbackDocs: RAGDocFeedback[];
  recentQueries: RAGQueryTrace[];
}

export interface RAGMetricsSummary {
  enabled: boolean;
  totalQueries: number;
  emptyResults: number;
  hitRate: number;
  averageResults: number;
  feedbackSignals: number;
  positiveFeedback: number;
  negativeFeedback: number;
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

export type ApplyResourceYAMLResponse = ActionResult | ResourceApplyRiskResponse;

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
  rag: RAGMetricsSummary;
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
  | "assistant"
  | "incidents"
  | "remediation"
  | "memory"
  | "riskguard"
  | "postmortems";
