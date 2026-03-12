import { useCallback, useEffect, useMemo, useState } from "react";
import { useStreamRefresh } from "../../../app/hooks/useStreamRefresh";
import { useAuthSession } from "../../../context/AuthSessionContext";
import { api } from "../../../lib/api";
import type { Node, NodeDetail, NodeDrainPreview } from "../../../types";

/**
 * UI state and actions for the nodes view.
 */
interface UseNodesDataResult {
  canRead: boolean;
  canWrite: boolean;
  nodes: Node[];
  filteredNodes: Node[];
  selectedNode: NodeDetail | null;
  lastDrainPreview: NodeDrainPreview | null;
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
  drain: (name: string) => Promise<void>;
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
  const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null);
  const [lastDrainPreview, setLastDrainPreview] = useState<NodeDrainPreview | null>(null);
  const [search, setSearchState] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canRead = can("read");
  const canWrite = can("write");

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
      const response = await api.getNodes();
      setNodes(response);
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

  const openDetail = useCallback(
    async (name: string) => {
      if (!canRead) {
        setError("Authenticate to view node details.");
        return;
      }

      setIsBusy(true);
      try {
        const response = await api.getNodeDetail(name);
        setSelectedNode(response);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load node details");
      } finally {
        setIsBusy(false);
      }
    },
    [canRead],
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
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to cordon node");
      } finally {
        setIsBusy(false);
      }
    },
    [canWrite, load],
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
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to uncordon node");
      } finally {
        setIsBusy(false);
      }
    },
    [canWrite, load],
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
    async (name: string) => {
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

        const forceDrain =
          preview.blockers.length > 0
            ? window.confirm(
                `Drain preview found ${preview.blockers.length} blockers for ${preview.evictable.length} pods. Press OK to force drain, Cancel to abort.`,
              )
            : window.confirm(`Drain node ${name}? This will evict ${preview.evictable.length} pods.`);
        if (!forceDrain && preview.blockers.length > 0) {
          setError("Drain canceled. Review blockers before forcing.");
          return;
        }
        if (preview.blockers.length === 0 && !forceDrain) {
          return;
        }

        await api.drainNode(name, preview.blockers.length > 0 && forceDrain);
        await load();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to drain node");
      } finally {
        setIsBusy(false);
      }
    },
    [canWrite, load],
  );

  const clearSelectedNode = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return {
    canRead,
    canWrite,
    nodes,
    filteredNodes,
    selectedNode,
    lastDrainPreview,
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
    clearSelectedNode,
  };
}
