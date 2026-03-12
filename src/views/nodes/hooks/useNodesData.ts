import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStreamRefresh } from "../../../app/hooks/useStreamRefresh";
import { useAuthSession } from "../../../context/AuthSessionContext";
import { api } from "../../../lib/api";
import type { K8sEvent, Node, NodeAlertLifecycle, NodeDetail, NodeDrainPreview, Pod } from "../../../types";
import { buildAllocatableDropAlert, deriveNodeRuleAlerts } from "./nodeRuleEngine";
import type { NodeDrainOptions, NodeRuleAlert } from "./nodesTypes";
import { ensureForceDrainReason, indexAlertLifecycleByID, parseCPUCapacity, parseMemoryCapacity } from "./nodesUtils";
export type { NodeDrainOptions, NodeRuleAlert } from "./nodesTypes";

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
  isUpdatingNodeAlertLifecycle: boolean;
  selectedNodeNames: string[];
  search: string;
  isLoading: boolean;
  isBusy: boolean;
  error: string | null;
  notice: string | null;
  setSearch: (value: string) => void;
  load: () => Promise<void>;
  openDetail: (name: string) => Promise<void>;
  cordon: (name: string) => Promise<void>;
  uncordon: (name: string) => Promise<void>;
  previewDrain: (name: string) => Promise<void>;
  drain: (name: string, options?: NodeDrainOptions) => Promise<void>;
  toggleNodeSelection: (name: string) => void;
  toggleSelectAllVisible: (names: string[]) => void;
  clearNodeSelection: () => void;
  bulkCordon: () => Promise<void>;
  bulkUncordon: () => Promise<void>;
  bulkDrain: (options?: NodeDrainOptions) => Promise<void>;
  dispatchNodeRuleAlert: (alertID: string) => Promise<void>;
  updateNodeAlertLifecycle: (
    alertID: string,
    status: "acknowledged" | "snoozed" | "dismissed" | "active",
  ) => Promise<void>;
  clearSelectedNode: () => void;
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
  const [isUpdatingNodeAlertLifecycle, setIsUpdatingNodeAlertLifecycle] = useState(false);
  const [alertLifecycleByID, setAlertLifecycleByID] = useState<Record<string, NodeAlertLifecycle>>({});
  const [selectedNodeNames, setSelectedNodeNames] = useState<string[]>([]);
  const [search, setSearchState] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canRead = can("read");
  const canWrite = can("write");
  const allocatableSnapshotRef = useRef<Record<string, { cpu: number; memory: number }>>({});

  const setSearch = useCallback((value: string) => {
    setSearchState(value);
  }, []);

  const reportError = useCallback((message: string) => {
    setError(message);
    setNotice(null);
  }, []);

  const reportNotice = useCallback((message: string) => {
    setNotice(message);
    setError(null);
  }, []);

  const load = useCallback(async () => {
    if (!canRead) {
      setNodes([]);
      reportError("Authenticate to view node data.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [nodeRows, eventRows, lifecycleRows] = await Promise.all([
        api.getNodes(),
        api.getEvents(),
        api.getAlertLifecycle().catch(() => [] as NodeAlertLifecycle[]),
      ]);
      setNodes(nodeRows);
      setClusterEvents(eventRows);
      setAlertLifecycleByID(indexAlertLifecycleByID(lifecycleRows));
      setSelectedNodeNames((state) => state.filter((name) => nodeRows.some((node) => node.name === name)));
      setError(null);
    } catch (err) {
      reportError(err instanceof Error ? err.message : "Failed to load nodes");
    } finally {
      setIsLoading(false);
    }
  }, [canRead, reportError]);

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

  const nodeRuleAlerts = useMemo(
    () => deriveNodeRuleAlerts(nodes, clusterEvents, allocatableDropAlerts, alertLifecycleByID),
    [alertLifecycleByID, allocatableDropAlerts, clusterEvents, nodes],
  );

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
          return [
            buildAllocatableDropAlert(name, cpuDrop, memoryDrop),
            ...state,
          ];
        });
      }
    }
  }, []);

  const openDetail = useCallback(
    async (name: string) => {
      if (!canRead) {
        reportError("Authenticate to view node details.");
        return;
      }

      setIsBusy(true);
      try {
        setLastDrainPreview(null);
        await loadNodeContext(name);
        setError(null);
      } catch (err) {
        reportError(err instanceof Error ? err.message : "Failed to load node details");
      } finally {
        setIsBusy(false);
      }
    },
    [canRead, loadNodeContext, reportError],
  );

  const cordon = useCallback(
    async (name: string) => {
      if (!canWrite) {
        reportError("Your role does not allow node cordon actions.");
        return;
      }
      if (!window.confirm(`Cordon node ${name}?`)) {
        return;
      }

      setIsBusy(true);
      try {
        const result = await api.cordonNode(name);
        await load();
        if (selectedNode?.name === name) {
          await loadNodeContext(name);
        }
        reportNotice(result.message || `Node ${name} cordoned.`);
      } catch (err) {
        reportError(err instanceof Error ? err.message : "Failed to cordon node");
      } finally {
        setIsBusy(false);
      }
    },
    [canWrite, load, loadNodeContext, reportError, reportNotice, selectedNode?.name],
  );

  const uncordon = useCallback(
    async (name: string) => {
      if (!canWrite) {
        reportError("Your role does not allow node uncordon actions.");
        return;
      }
      if (!window.confirm(`Uncordon node ${name}?`)) {
        return;
      }

      setIsBusy(true);
      try {
        const result = await api.uncordonNode(name);
        await load();
        if (selectedNode?.name === name) {
          await loadNodeContext(name);
        }
        reportNotice(result.message || `Node ${name} uncordoned.`);
      } catch (err) {
        reportError(err instanceof Error ? err.message : "Failed to uncordon node");
      } finally {
        setIsBusy(false);
      }
    },
    [canWrite, load, loadNodeContext, reportError, reportNotice, selectedNode?.name],
  );

  const previewDrain = useCallback(
    async (name: string) => {
      if (!canWrite) {
        reportError("Your role does not allow node drain actions.");
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
        reportNotice(summary);
      } catch (err) {
        reportError(err instanceof Error ? err.message : "Failed to preview node drain");
      } finally {
        setIsBusy(false);
      }
    },
    [canWrite, reportError, reportNotice],
  );

  const drain = useCallback(
    async (name: string, options: NodeDrainOptions = {}) => {
      const force = options.force === true;
      if (!canWrite) {
        reportError("Your role does not allow node drain actions.");
        return;
      }

      setIsBusy(true);
      try {
        const preview = await api.previewNodeDrain(name);
        setLastDrainPreview(preview);

        if (preview.evictable.length === 0) {
          reportNotice("No evictable pods found on this node.");
          return;
        }

        if (preview.blockers.length > 0 && !force) {
          reportNotice("Drain blocked by safety checks. Run force drain from maintenance mode if you accept the risks.");
          return;
        }
        if (!force && !window.confirm(`Drain node ${name}? This will evict ${preview.evictable.length} pods.`)) {
          return;
        }

        const reason = force ? ensureForceDrainReason(name, options.reason) : "";
        if (force && reason === null) {
          reportNotice("Force drain cancelled. A reason is required to continue.");
          return;
        }

        const result = await api.drainNode(name, { force, reason: reason ?? "" });
        await load();
        if (selectedNode?.name === name) {
          await loadNodeContext(name);
        }
        reportNotice(result.message || `Node ${name} drain requested.`);
      } catch (err) {
        reportError(err instanceof Error ? err.message : "Failed to drain node");
      } finally {
        setIsBusy(false);
      }
    },
    [canWrite, load, loadNodeContext, reportError, reportNotice, selectedNode?.name],
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
      reportError("Your role does not allow node cordon actions.");
      return;
    }
    if (selectedNodeNames.length === 0) {
      reportError("Select at least one node for bulk actions.");
      return;
    }
    if (!window.confirm(`Cordon ${selectedNodeNames.length} selected node(s)?`)) {
      return;
    }

    setIsBusy(true);
    try {
      const results = await Promise.all(selectedNodeNames.map((name) => api.cordonNode(name)));
      await load();
      reportNotice(results[0]?.message || `Cordoned ${selectedNodeNames.length} node(s).`);
      setSelectedNodeNames([]);
    } catch (err) {
      reportError(err instanceof Error ? err.message : "Failed to bulk cordon nodes");
    } finally {
      setIsBusy(false);
    }
  }, [canWrite, load, reportError, reportNotice, selectedNodeNames]);

  const bulkUncordon = useCallback(async () => {
    if (!canWrite) {
      reportError("Your role does not allow node uncordon actions.");
      return;
    }
    if (selectedNodeNames.length === 0) {
      reportError("Select at least one node for bulk actions.");
      return;
    }
    if (!window.confirm(`Uncordon ${selectedNodeNames.length} selected node(s)?`)) {
      return;
    }

    setIsBusy(true);
    try {
      const results = await Promise.all(selectedNodeNames.map((name) => api.uncordonNode(name)));
      await load();
      reportNotice(results[0]?.message || `Uncordoned ${selectedNodeNames.length} node(s).`);
      setSelectedNodeNames([]);
    } catch (err) {
      reportError(err instanceof Error ? err.message : "Failed to bulk uncordon nodes");
    } finally {
      setIsBusy(false);
    }
  }, [canWrite, load, reportError, reportNotice, selectedNodeNames]);

  const bulkDrain = useCallback(
    async (options: NodeDrainOptions = {}) => {
      const force = options.force === true;
      if (!canWrite) {
        reportError("Your role does not allow node drain actions.");
        return;
      }
      if (selectedNodeNames.length === 0) {
        reportError("Select at least one node for bulk actions.");
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
        const reason = force ? ensureForceDrainReason("selected nodes", options.reason) : "";
        if (force && reason === null) {
          reportNotice("Force drain cancelled. A reason is required to continue.");
          return;
        }

        const blocked: string[] = [];
        for (const name of selectedNodeNames) {
          const preview = await api.previewNodeDrain(name);
          if (!force && preview.blockers.length > 0) {
            blocked.push(name);
            continue;
          }
          await api.drainNode(name, { force, reason: reason ?? "" });
        }
        await load();
        setSelectedNodeNames([]);
        if (blocked.length > 0) {
          reportNotice(`Skipped ${blocked.length} node(s) due to blockers: ${blocked.join(", ")}`);
        } else {
          reportNotice(`Drain requested for ${selectedNodeNames.length} node(s).`);
        }
      } catch (err) {
        reportError(err instanceof Error ? err.message : "Failed to bulk drain nodes");
      } finally {
        setIsBusy(false);
      }
    },
    [canWrite, load, reportError, reportNotice, selectedNodeNames],
  );

  const dispatchNodeRuleAlert = useCallback(
    async (alertID: string) => {
      if (!canWrite) {
        reportError("Your role does not allow alert dispatch.");
        return;
      }
      const alert = nodeRuleAlerts.find((item) => item.id === alertID);
      if (!alert) {
        reportError("Selected node alert no longer exists.");
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
        if (response.success) {
          reportNotice("Node alert dispatched to configured channels.");
        } else {
          reportError("Node alert dispatch partially failed.");
        }
      } catch (err) {
        reportError(err instanceof Error ? err.message : "Failed to dispatch node alert");
      } finally {
        setIsDispatchingNodeAlert(false);
      }
    },
    [canWrite, nodeRuleAlerts, reportError, reportNotice],
  );

  const updateNodeAlertLifecycle = useCallback(
    async (alertID: string, status: "acknowledged" | "snoozed" | "dismissed" | "active") => {
      if (!canWrite) {
        reportError("Your role does not allow alert lifecycle updates.");
        return;
      }
      const alert = nodeRuleAlerts.find((item) => item.id === alertID);
      if (!alert) {
        reportError("Selected node alert no longer exists.");
        return;
      }

      let snoozeMinutes = 0;
      if (status === "snoozed") {
        const raw = window.prompt("Snooze duration in minutes (1-1440):", "30");
        if (raw === null) {
          return;
        }
        const parsed = Number.parseInt(raw.trim(), 10);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1440) {
          reportError("Invalid snooze duration. Enter a number between 1 and 1440.");
          return;
        }
        snoozeMinutes = parsed;
      }

      setIsUpdatingNodeAlertLifecycle(true);
      try {
        const updated = await api.updateAlertLifecycle({
          id: alert.id,
          node: alert.node,
          rule: alert.rule,
          status,
          snoozeMinutes: snoozeMinutes > 0 ? snoozeMinutes : undefined,
        });
        setAlertLifecycleByID((state) => ({
          ...state,
          [updated.id]: updated,
        }));
        reportNotice(
          status === "active"
            ? "Node alert moved back to active."
            : status === "acknowledged"
              ? "Node alert acknowledged."
              : status === "dismissed"
                ? "Node alert dismissed."
                : `Node alert snoozed for ${snoozeMinutes} minute(s).`,
        );
      } catch (err) {
        reportError(err instanceof Error ? err.message : "Failed to update node alert lifecycle");
      } finally {
        setIsUpdatingNodeAlertLifecycle(false);
      }
    },
    [canWrite, nodeRuleAlerts, reportError, reportNotice],
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
    isUpdatingNodeAlertLifecycle,
    selectedNodeNames,
    search,
    isLoading,
    isBusy,
    error,
    notice,
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
    updateNodeAlertLifecycle,
    clearSelectedNode,
  };
}
