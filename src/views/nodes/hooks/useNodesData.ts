import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStreamRefresh } from "../../../app/hooks/useStreamRefresh";
import { useAuthSession } from "../../../context/AuthSessionContext";
import { api } from "../../../lib/api";
import type { K8sEvent, Node, NodeDetail, NodeDrainPreview, Pod } from "../../../types";

/**
 * UI state and actions for the nodes view.
 */
interface UseNodesDataResult {
  canRead: boolean;
  canWrite: boolean;
  nodes: Node[];
  filteredNodes: Node[];
  selectedNode: NodeDetail | null;
  selectedNodePods: Pod[];
  selectedNodeEvents: K8sEvent[];
  lastDrainPreview: NodeDrainPreview | null;
  nodeRuleAlerts: NodeRuleAlert[];
  isDispatchingNodeAlert: boolean;
  selectedNodeNames: string[];
  search: string;
  isLoading: boolean;
  isBusy: boolean;
  error: string | null;
  setSearch: (value: string) => void;
  load: () => Promise<void>;
  openDetail: (name: string) => Promise<void>;
  cordon: (name: string) => Promise<void>;
  uncordon: (name: string) => Promise<void>;
  previewDrain: (name: string) => Promise<void>;
  drain: (name: string, force?: boolean) => Promise<void>;
  toggleNodeSelection: (name: string) => void;
  toggleSelectAllVisible: (names: string[]) => void;
  clearNodeSelection: () => void;
  bulkCordon: () => Promise<void>;
  bulkUncordon: () => Promise<void>;
  bulkDrain: (force?: boolean) => Promise<void>;
  dispatchNodeRuleAlert: (alertID: string) => Promise<void>;
  clearSelectedNode: () => void;
}

export interface NodeRuleAlert {
  id: string;
  node: string;
  rule: "readiness_flap" | "sustained_pressure" | "allocatable_drop";
  severity: "warning" | "critical";
  title: string;
  message: string;
}

/**
 * Manages data loading and node actions for the Nodes view.
 *
 * @returns Nodes state and command handlers for rendering and interaction.
 */
export function useNodesData(): UseNodesDataResult {
  const { can, isLoading: authLoading } = useAuthSession();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [clusterEvents, setClusterEvents] = useState<K8sEvent[]>([]);
  const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null);
  const [selectedNodePods, setSelectedNodePods] = useState<Pod[]>([]);
  const [selectedNodeEvents, setSelectedNodeEvents] = useState<K8sEvent[]>([]);
  const [lastDrainPreview, setLastDrainPreview] = useState<NodeDrainPreview | null>(null);
  const [allocatableDropAlerts, setAllocatableDropAlerts] = useState<NodeRuleAlert[]>([]);
  const [isDispatchingNodeAlert, setIsDispatchingNodeAlert] = useState(false);
  const [selectedNodeNames, setSelectedNodeNames] = useState<string[]>([]);
  const [search, setSearchState] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRead = can("read");
  const canWrite = can("write");
  const allocatableSnapshotRef = useRef<Record<string, { cpu: number; memory: number }>>({});

  const setSearch = useCallback((value: string) => {
    setSearchState(value);
  }, []);

  const load = useCallback(async () => {
    if (!canRead) {
      setNodes([]);
      setError("Authenticate to view node data.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [nodeRows, eventRows] = await Promise.all([api.getNodes(), api.getEvents()]);
      setNodes(nodeRows);
      setClusterEvents(eventRows);
      setSelectedNodeNames((state) => state.filter((name) => nodeRows.some((node) => node.name === name)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load nodes");
    } finally {
      setIsLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    void load();
  }, [authLoading, load]);

  useStreamRefresh({
    enabled: canRead,
    eventTypes: ["node_update", "node_not_ready", "node_pressure", "node_deleted"],
    onEvent: () => {
      void load();
    },
  });

  const filteredNodes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query === "") {
      return nodes;
    }

    return nodes.filter((node) => `${node.name} ${node.roles} ${node.status}`.toLowerCase().includes(query));
  }, [nodes, search]);

  const nodeRuleAlerts = useMemo(() => {
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
        });
      }
    }

    const dedup = new Map<string, NodeRuleAlert>();
    for (const alert of [...alerts, ...allocatableDropAlerts]) {
      dedup.set(alert.id, alert);
    }
    return Array.from(dedup.values());
  }, [allocatableDropAlerts, clusterEvents, nodes]);

  const loadNodeContext = useCallback(async (name: string) => {
    const [detail, nodePods, nodeEvents] = await Promise.all([
      api.getNodeDetail(name),
      api.getNodePods(name),
      api.getNodeEvents(name),
    ]);

    setSelectedNode(detail);
    setSelectedNodePods(nodePods);
    setSelectedNodeEvents(nodeEvents);

    const currentAllocatable = {
      cpu: parseCPUCapacity(detail.allocatable.cpu),
      memory: parseMemoryCapacity(detail.allocatable.memory),
    };
    const previous = allocatableSnapshotRef.current[name];
    allocatableSnapshotRef.current[name] = currentAllocatable;

    if (previous && previous.cpu > 0 && previous.memory > 0) {
      const cpuDrop = (previous.cpu - currentAllocatable.cpu) / previous.cpu;
      const memoryDrop = (previous.memory - currentAllocatable.memory) / previous.memory;
      const threshold = 0.1;
      if (cpuDrop >= threshold || memoryDrop >= threshold) {
        setAllocatableDropAlerts((state) => {
          if (state.some((alert) => alert.node === name && alert.rule === "allocatable_drop")) {
            return state;
          }
          const details =
            cpuDrop >= threshold && memoryDrop >= threshold
              ? `CPU allocatable dropped ${(cpuDrop * 100).toFixed(1)}% and memory allocatable dropped ${(memoryDrop * 100).toFixed(1)}%.`
              : cpuDrop >= threshold
                ? `CPU allocatable dropped ${(cpuDrop * 100).toFixed(1)}%.`
                : `Memory allocatable dropped ${(memoryDrop * 100).toFixed(1)}%.`;
          return [
            {
              id: `allocatable-drop-${name}-${Date.now()}`,
              node: name,
              rule: "allocatable_drop",
              severity: "critical",
              title: `Allocatable drop detected on ${name}`,
              message: `${details} This can indicate kubelet reservation changes, tainting side effects, or node pressure.`,
            },
            ...state,
          ];
        });
      }
    }
  }, []);

  const openDetail = useCallback(
    async (name: string) => {
      if (!canRead) {
        setError("Authenticate to view node details.");
        return;
      }

      setIsBusy(true);
      try {
        setLastDrainPreview(null);
        await loadNodeContext(name);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load node details");
      } finally {
        setIsBusy(false);
      }
    },
    [canRead, loadNodeContext],
  );

  const cordon = useCallback(
    async (name: string) => {
      if (!canWrite) {
        setError("Your role does not allow node cordon actions.");
        return;
      }
      if (!window.confirm(`Cordon node ${name}?`)) {
        return;
      }

      setIsBusy(true);
      try {
        await api.cordonNode(name);
        await load();
        if (selectedNode?.name === name) {
          await loadNodeContext(name);
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to cordon node");
      } finally {
        setIsBusy(false);
      }
    },
    [canWrite, load, loadNodeContext, selectedNode?.name],
  );

  const uncordon = useCallback(
    async (name: string) => {
      if (!canWrite) {
        setError("Your role does not allow node uncordon actions.");
        return;
      }
      if (!window.confirm(`Uncordon node ${name}?`)) {
        return;
      }

      setIsBusy(true);
      try {
        await api.uncordonNode(name);
        await load();
        if (selectedNode?.name === name) {
          await loadNodeContext(name);
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to uncordon node");
      } finally {
        setIsBusy(false);
      }
    },
    [canWrite, load, loadNodeContext, selectedNode?.name],
  );

  const previewDrain = useCallback(
    async (name: string) => {
      if (!canWrite) {
        setError("Your role does not allow node drain actions.");
        return;
      }
      setIsBusy(true);
      try {
        const preview = await api.previewNodeDrain(name);
        setLastDrainPreview(preview);
        const summary =
          preview.blockers.length > 0
            ? `Drain preview: ${preview.evictable.length} evictable pods, ${preview.blockers.length} blockers.`
            : `Drain preview: ${preview.evictable.length} evictable pods, no blockers.`;
        setError(summary);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to preview node drain");
      } finally {
        setIsBusy(false);
      }
    },
    [canWrite],
  );

  const drain = useCallback(
    async (name: string, force = false) => {
      if (!canWrite) {
        setError("Your role does not allow node drain actions.");
        return;
      }

      setIsBusy(true);
      try {
        const preview = await api.previewNodeDrain(name);
        setLastDrainPreview(preview);

        if (preview.evictable.length === 0) {
          setError("No evictable pods found on this node.");
          return;
        }

        if (preview.blockers.length > 0 && !force) {
          setError("Drain blocked by safety checks. Run force drain from maintenance mode if you accept the risks.");
          return;
        }
        if (!force && !window.confirm(`Drain node ${name}? This will evict ${preview.evictable.length} pods.`)) {
          return;
        }

        await api.drainNode(name, force);
        await load();
        if (selectedNode?.name === name) {
          await loadNodeContext(name);
        }
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to drain node");
      } finally {
        setIsBusy(false);
      }
    },
    [canWrite, load, loadNodeContext, selectedNode?.name],
  );

  const clearSelectedNode = useCallback(() => {
    setSelectedNode(null);
    setSelectedNodePods([]);
    setSelectedNodeEvents([]);
  }, []);

  const toggleNodeSelection = useCallback((name: string) => {
    setSelectedNodeNames((state) => (state.includes(name) ? state.filter((item) => item !== name) : [...state, name]));
  }, []);

  const toggleSelectAllVisible = useCallback((names: string[]) => {
    if (names.length === 0) {
      setSelectedNodeNames([]);
      return;
    }
    setSelectedNodeNames((state) => {
      const allSelected = names.every((name) => state.includes(name));
      if (allSelected) {
        return state.filter((name) => !names.includes(name));
      }
      const next = new Set(state);
      for (const name of names) {
        next.add(name);
      }
      return Array.from(next);
    });
  }, []);

  const clearNodeSelection = useCallback(() => {
    setSelectedNodeNames([]);
  }, []);

  const bulkCordon = useCallback(async () => {
    if (!canWrite) {
      setError("Your role does not allow node cordon actions.");
      return;
    }
    if (selectedNodeNames.length === 0) {
      setError("Select at least one node for bulk actions.");
      return;
    }
    if (!window.confirm(`Cordon ${selectedNodeNames.length} selected node(s)?`)) {
      return;
    }

    setIsBusy(true);
    try {
      await Promise.all(selectedNodeNames.map((name) => api.cordonNode(name)));
      await load();
      setError(null);
      setSelectedNodeNames([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to bulk cordon nodes");
    } finally {
      setIsBusy(false);
    }
  }, [canWrite, load, selectedNodeNames]);

  const bulkUncordon = useCallback(async () => {
    if (!canWrite) {
      setError("Your role does not allow node uncordon actions.");
      return;
    }
    if (selectedNodeNames.length === 0) {
      setError("Select at least one node for bulk actions.");
      return;
    }
    if (!window.confirm(`Uncordon ${selectedNodeNames.length} selected node(s)?`)) {
      return;
    }

    setIsBusy(true);
    try {
      await Promise.all(selectedNodeNames.map((name) => api.uncordonNode(name)));
      await load();
      setError(null);
      setSelectedNodeNames([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to bulk uncordon nodes");
    } finally {
      setIsBusy(false);
    }
  }, [canWrite, load, selectedNodeNames]);

  const bulkDrain = useCallback(
    async (force = false) => {
      if (!canWrite) {
        setError("Your role does not allow node drain actions.");
        return;
      }
      if (selectedNodeNames.length === 0) {
        setError("Select at least one node for bulk actions.");
        return;
      }
      if (
        !window.confirm(
          `${force ? "Force d" : "D"}rain ${selectedNodeNames.length} selected node(s)? This will evict workloads.`,
        )
      ) {
        return;
      }

      setIsBusy(true);
      try {
        const blocked: string[] = [];
        for (const name of selectedNodeNames) {
          const preview = await api.previewNodeDrain(name);
          if (!force && preview.blockers.length > 0) {
            blocked.push(name);
            continue;
          }
          await api.drainNode(name, force);
        }
        await load();
        setSelectedNodeNames([]);
        if (blocked.length > 0) {
          setError(`Skipped ${blocked.length} node(s) due to blockers: ${blocked.join(", ")}`);
        } else {
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to bulk drain nodes");
      } finally {
        setIsBusy(false);
      }
    },
    [canWrite, load, selectedNodeNames],
  );

  const dispatchNodeRuleAlert = useCallback(
    async (alertID: string) => {
      if (!canWrite) {
        setError("Your role does not allow alert dispatch.");
        return;
      }
      const alert = nodeRuleAlerts.find((item) => item.id === alertID);
      if (!alert) {
        setError("Selected node alert no longer exists.");
        return;
      }

      setIsDispatchingNodeAlert(true);
      try {
        const response = await api.dispatchAlert({
          title: alert.title,
          message: alert.message,
          severity: alert.severity,
          source: "nodes-rule-engine",
          tags: ["nodes", alert.rule, alert.node],
        });
        setError(response.success ? "Node alert dispatched to configured channels." : "Node alert dispatch partially failed.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to dispatch node alert");
      } finally {
        setIsDispatchingNodeAlert(false);
      }
    },
    [canWrite, nodeRuleAlerts],
  );

  return {
    canRead,
    canWrite,
    nodes,
    filteredNodes,
    selectedNode,
    selectedNodePods,
    selectedNodeEvents,
    lastDrainPreview,
    nodeRuleAlerts,
    isDispatchingNodeAlert,
    selectedNodeNames,
    search,
    isLoading,
    isBusy,
    error,
    setSearch,
    load,
    openDetail,
    cordon,
    uncordon,
    previewDrain,
    drain,
    toggleNodeSelection,
    toggleSelectAllVisible,
    clearNodeSelection,
    bulkCordon,
    bulkUncordon,
    bulkDrain,
    dispatchNodeRuleAlert,
    clearSelectedNode,
  };
}

function parseCPUCapacity(raw: string): number {
  const value = raw.trim().toLowerCase();
  if (value === "") {
    return 0;
  }
  if (value.endsWith("m")) {
    const milli = Number.parseFloat(value.slice(0, -1));
    return Number.isFinite(milli) ? milli / 1000 : 0;
  }
  const cores = Number.parseFloat(value);
  return Number.isFinite(cores) ? cores : 0;
}

function parseMemoryCapacity(raw: string): number {
  const value = raw.trim();
  if (value === "") {
    return 0;
  }

  const match = /^([0-9]+(?:\.[0-9]+)?)([KMGTE]i?)?$/i.exec(value);
  if (!match) {
    return 0;
  }

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) {
    return 0;
  }

  const unit = (match[2] ?? "").toLowerCase();
  const multiplier =
    unit === "ki"
      ? 1024
      : unit === "mi"
        ? 1024 ** 2
        : unit === "gi"
          ? 1024 ** 3
          : unit === "ti"
            ? 1024 ** 4
            : unit === "ei"
              ? 1024 ** 6
              : unit === "k"
                ? 1000
                : unit === "m"
                  ? 1000 ** 2
                  : unit === "g"
                    ? 1000 ** 3
                    : unit === "t"
                      ? 1000 ** 4
                      : unit === "e"
                        ? 1000 ** 6
                        : 1;

  return amount * multiplier;
}
