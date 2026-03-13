import type { ResourceApplyRiskResponse } from "./risk";

export type PodStatus = "Running" | "Pending" | "Failed" | "Succeeded" | "Terminating" | "Unknown";
export type NodeStatus = "Ready" | "NotReady" | "Unknown";

export interface Pod {
  id: string;
  name: string;
  namespace: string;
  nodeName?: string;
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
  namespace?: string;
  resource?: string;
  resourceKind?: string;
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
  unschedulable?: boolean;
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

export interface ClusterStats {
  pods: { total: number; running: number; pending: number; failed: number };
  nodes: { total: number; ready: number; notReady: number };
  cluster: { cpu: string; memory: string; storage: string };
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
