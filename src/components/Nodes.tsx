import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Node, NodeDetail } from "../types";
import NodeDetailModal from "./nodes/NodeDetailModal";

export default function Nodes() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedNode, setSelectedNode] = useState<NodeDetail | null>(null);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredNodes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query === "") {
      return nodes;
    }

    return nodes.filter((node) => `${node.name} ${node.roles} ${node.status}`.toLowerCase().includes(query));
  }, [nodes, search]);

  const openDetail = useCallback(async (name: string) => {
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
  }, []);

  const cordon = useCallback(
    async (name: string) => {
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
    [load],
  );

  return (
    <div className="space-y-5">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Nodes</h2>
          <p className="text-sm text-zinc-400 mt-1">Infrastructure status and scheduling controls.</p>
        </div>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search nodes"
            className="field w-72"
          />
          <button
            onClick={() => void load()}
            disabled={isLoading || isBusy}
            className="btn"
          >
            {isLoading ? "Loading" : "Refresh"}
          </button>
        </div>
      </header>

      {error && <div className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">{error}</div>}

      <div className="table-shell">
        <table className="min-w-full text-left text-sm">
          <thead className="table-head table-head-sticky">
            <tr>
              <th className="px-4 py-3 font-semibold">Node</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Roles</th>
              <th className="px-4 py-3 font-semibold">CPU Usage</th>
              <th className="px-4 py-3 font-semibold">Memory Usage</th>
              <th className="px-4 py-3 font-semibold">Version</th>
              <th className="px-4 py-3 font-semibold">Age</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 text-zinc-200">
            {filteredNodes.map((node) => (
              <tr key={node.name} className="table-row">
                <td className="px-4 py-3 font-medium">{node.name}</td>
                <td className="px-4 py-3">{node.status}</td>
                <td className="px-4 py-3 text-zinc-400">{node.roles}</td>
                <td className="px-4 py-3 text-zinc-400">{node.cpuUsage}</td>
                <td className="px-4 py-3 text-zinc-400">{node.memUsage}</td>
                <td className="px-4 py-3 text-zinc-400">{node.version}</td>
                <td className="px-4 py-3 text-zinc-400">{node.age}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => void cordon(node.name)} className="btn-sm">
                      Cordon
                    </button>
                    <button onClick={() => void openDetail(node.name)} className="btn-sm">
                      Details
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {isLoading && <p className="px-4 py-8 text-center text-sm text-zinc-500">Loading nodes...</p>}
        {!isLoading && filteredNodes.length === 0 && <p className="px-4 py-8 text-center text-sm text-zinc-500">No nodes found.</p>}
      </div>

      <NodeDetailModal selectedNode={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
}


