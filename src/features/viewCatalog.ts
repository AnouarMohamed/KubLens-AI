import type { View } from "../types";

export interface ViewItem {
  id: View;
  label: string;
  description: string;
  kubectlCommand: string;
}

export interface ViewSection {
  id: string;
  label: string;
  items: ViewItem[];
}

export const VIEW_SECTIONS: ViewSection[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      {
        id: "overview",
        label: "Cluster Overview",
        description: "Health, capacity, and workload summary in one view.",
        kubectlCommand: "kubectl cluster-info",
      },
    ],
  },
  {
    id: "workloads",
    label: "Workloads",
    items: [
      { id: "pods", label: "Pods", description: "Inspect pod health and actions.", kubectlCommand: "kubectl get pods -A" },
      { id: "deployments", label: "Deployments", description: "Review rollout state and replica health.", kubectlCommand: "kubectl get deployments -A" },
      { id: "replicasets", label: "ReplicaSets", description: "Track desired versus ready replicas.", kubectlCommand: "kubectl get replicasets -A" },
      { id: "statefulsets", label: "StatefulSets", description: "Manage stateful workloads and storage identity.", kubectlCommand: "kubectl get statefulsets -A" },
      { id: "daemonsets", label: "DaemonSets", description: "Observe node-level agents and rollout health.", kubectlCommand: "kubectl get daemonsets -A" },
      { id: "jobs", label: "Jobs", description: "Monitor batch runs and completion state.", kubectlCommand: "kubectl get jobs -A" },
      { id: "cronjobs", label: "CronJobs", description: "Monitor schedules and recurring batch execution.", kubectlCommand: "kubectl get cronjobs -A" },
    ],
  },
  {
    id: "networking",
    label: "Networking",
    items: [
      { id: "services", label: "Services", description: "Service endpoints and exposure model.", kubectlCommand: "kubectl get svc -A" },
      { id: "ingresses", label: "Ingresses", description: "Routing rules and external entry points.", kubectlCommand: "kubectl get ingress -A" },
      { id: "networkpolicies", label: "Network Policies", description: "Traffic isolation policies.", kubectlCommand: "kubectl get networkpolicy -A" },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    items: [
      { id: "configmaps", label: "ConfigMaps", description: "Runtime configuration objects.", kubectlCommand: "kubectl get configmaps -A" },
      { id: "secrets", label: "Secrets", description: "Secret inventory and usage footprint.", kubectlCommand: "kubectl get secrets -A" },
    ],
  },
  {
    id: "storage",
    label: "Storage",
    items: [
      { id: "persistentvolumes", label: "PersistentVolumes", description: "Cluster-level storage inventory.", kubectlCommand: "kubectl get pv" },
      { id: "persistentvolumeclaims", label: "PersistentVolumeClaims", description: "Namespace volume claims.", kubectlCommand: "kubectl get pvc -A" },
      { id: "storageclasses", label: "StorageClasses", description: "Provisioner and policy definitions.", kubectlCommand: "kubectl get storageclass" },
    ],
  },
  {
    id: "cluster",
    label: "Cluster",
    items: [
      { id: "nodes", label: "Nodes", description: "Node readiness and resource pressure.", kubectlCommand: "kubectl get nodes" },
      { id: "namespaces", label: "Namespaces", description: "Namespace boundaries and lifecycle.", kubectlCommand: "kubectl get namespaces" },
      { id: "events", label: "Events", description: "Recent cluster warnings and changes.", kubectlCommand: "kubectl get events -A --sort-by=.metadata.creationTimestamp" },
    ],
  },
  {
    id: "access",
    label: "Access",
    items: [
      { id: "serviceaccounts", label: "Service Accounts", description: "Workload identities and token-linked objects.", kubectlCommand: "kubectl get serviceaccounts -A" },
      { id: "rbac", label: "RBAC", description: "Roles and bindings overview.", kubectlCommand: "kubectl get roles,rolebindings,clusterroles,clusterrolebindings -A" },
    ],
  },
  {
    id: "observability",
    label: "Observability",
    items: [
      { id: "metrics", label: "Metrics", description: "Interactive analytics, graphs, trends, and API telemetry.", kubectlCommand: "kubectl top pods -A" },
      { id: "audit", label: "Audit Trail", description: "Live request and action history with operator attribution.", kubectlCommand: "kubectl get events -A --sort-by=.metadata.creationTimestamp" },
      {
        id: "predictions",
        label: "Predictions",
        description: "ML-assisted incident risk scoring for pods and nodes.",
        kubectlCommand: "kubectl get events -A --sort-by=.metadata.creationTimestamp",
      },
      { id: "diagnostics", label: "Diagnostics", description: "Automated issue detection and remediation guidance.", kubectlCommand: "kubectl describe nodes" },
    ],
  },
  {
    id: "ai",
    label: "Ops",
    items: [
      { id: "terminal", label: "Terminal", description: "Run shell and kubectl commands in-app.", kubectlCommand: "kubectl get pods -A" },
      { id: "assistant", label: "Assistant", description: "Deterministic plus LLM-assisted troubleshooting.", kubectlCommand: "kubectl get pods -A" },
    ],
  },
];

export const VIEW_MAP: Record<View, ViewItem> = VIEW_SECTIONS.flatMap((section) => section.items).reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<View, ViewItem>,
);

export function getViewItem(view: View): ViewItem {
  return VIEW_MAP[view];
}

export function findViewByQuery(query: string): ViewItem | null {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") {
    return null;
  }

  return (
    Object.values(VIEW_MAP).find(
      (item) => item.label.toLowerCase().includes(normalized) || item.id.toLowerCase().includes(normalized),
    ) ?? null
  );
}
