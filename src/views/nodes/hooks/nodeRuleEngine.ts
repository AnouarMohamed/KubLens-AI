import type { K8sEvent, Node, NodeAlertLifecycle } from "../../../types";
import type { NodeRuleAlert } from "./nodesTypes";

/**
 * Computes node rule alerts from node snapshots, events, derived allocatable alerts, and lifecycle state.
 */
export function deriveNodeRuleAlerts(
  nodes: Node[],
  clusterEvents: K8sEvent[],
  allocatableDropAlerts: NodeRuleAlert[],
  alertLifecycleByID: Record<string, NodeAlertLifecycle>,
): NodeRuleAlert[] {
  const alerts: NodeRuleAlert[] = [];
  const nodeEvents = clusterEvents.filter((event) => (event.resourceKind ?? "").toLowerCase() === "node");

  for (const node of nodes) {
    const eventsForNode = nodeEvents.filter((event) => (event.resource ?? "").toLowerCase() === node.name.toLowerCase());
    const readinessTransitions = eventsForNode.filter((event) =>
      ["nodeready", "nodenotready"].includes((event.reason ?? "").toLowerCase()),
    ).length;
    if (readinessTransitions >= 3) {
      alerts.push({
        id: `readiness-flap-${node.name}`,
        node: node.name,
        rule: "readiness_flap",
        severity: "warning",
        title: `Readiness flap on ${node.name}`,
        message: `${readinessTransitions} readiness transitions detected. Investigate kubelet, networking, or node stability.`,
        lifecycleStatus: "active",
      });
    }

    const pressureSignals = eventsForNode.filter((event) => {
      const reason = (event.reason ?? "").toLowerCase();
      const message = (event.message ?? "").toLowerCase();
      return reason.includes("pressure") || message.includes("pressure");
    }).length;
    if (pressureSignals >= 2) {
      alerts.push({
        id: `pressure-${node.name}`,
        node: node.name,
        rule: "sustained_pressure",
        severity: "critical",
        title: `Sustained pressure on ${node.name}`,
        message: `${pressureSignals} pressure events detected. Review memory, disk, and PID pressure conditions.`,
        lifecycleStatus: "active",
      });
    }
  }

  const dedup = new Map<string, NodeRuleAlert>();
  for (const alert of [...alerts, ...allocatableDropAlerts]) {
    dedup.set(alert.id, alert);
  }

  return Array.from(dedup.values()).map((alert) => {
    const lifecycle = alertLifecycleByID[alert.id];
    if (!lifecycle) {
      return alert;
    }
    return {
      ...alert,
      lifecycleStatus: lifecycle.status,
      lifecycleNote: lifecycle.note,
      lifecycleUpdatedAt: lifecycle.updatedAt,
      lifecycleUpdatedBy: lifecycle.updatedBy,
      snoozedUntil: lifecycle.snoozedUntil,
    };
  });
}

/**
 * Builds a critical alert when allocatable capacity drops materially for a node.
 */
export function buildAllocatableDropAlert(name: string, cpuDrop: number, memoryDrop: number): NodeRuleAlert {
  const threshold = 0.1;
  const details =
    cpuDrop >= threshold && memoryDrop >= threshold
      ? `CPU allocatable dropped ${(cpuDrop * 100).toFixed(1)}% and memory allocatable dropped ${(memoryDrop * 100).toFixed(1)}%.`
      : cpuDrop >= threshold
        ? `CPU allocatable dropped ${(cpuDrop * 100).toFixed(1)}%.`
        : `Memory allocatable dropped ${(memoryDrop * 100).toFixed(1)}%.`;

  return {
    id: `allocatable-drop-${name}-${Date.now()}`,
    node: name,
    rule: "allocatable_drop",
    severity: "critical",
    title: `Allocatable drop detected on ${name}`,
    message: `${details} This can indicate kubelet reservation changes, tainting side effects, or node pressure.`,
    lifecycleStatus: "active",
  };
}
