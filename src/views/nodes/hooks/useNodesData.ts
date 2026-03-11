import { useCallback, useEffect, useMemo, useState } from "react";
import { useStreamRefresh } from "../../../app/hooks/useStreamRefresh";
import { useAuthSession } from "../../../context/AuthSessionContext";
import { api } from "../../../lib/api";
import type { Node, NodeDetail } from "../../../types";

/**
 * UI state and actions for the nodes view.
 */
interface UseNodesDataResult {
  canRead: boolean;
  canWrite: boolean;
  nodes: Node[];
  filteredNodes: Node[];
  selectedNode: NodeDetail | null;
  search: string;
  isLoading: boolean;
  isBusy: boolean;
  error: string | null;
  setSearch: (value: string) => void;
  load: () => Promise<void>;
  openDetail: (name: string) => Promise<void>;
  cordon: (name: string) => Promise<void>;
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

  const clearSelectedNode = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return {
    canRead,
    canWrite,
    nodes,
    filteredNodes,
    selectedNode,
    search,
    isLoading,
    isBusy,
    error,
    setSearch,
    load,
    openDetail,
    cordon,
    clearSelectedNode,
  };
}
