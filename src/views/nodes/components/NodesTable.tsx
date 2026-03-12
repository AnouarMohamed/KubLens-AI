import type { Node } from "../../../types";

/**
 * Tabular node inventory with node-level actions.
 */
interface NodesTableProps {
  nodes: Node[];
  isLoading: boolean;
  canRead: boolean;
  canWrite: boolean;
  onOpenDetail: (name: string) => Promise<void>;
  onCordon: (name: string) => Promise<void>;
  onUncordon: (name: string) => Promise<void>;
  onPreviewDrain: (name: string) => Promise<void>;
  onDrain: (name: string) => Promise<void>;
}

export function NodesTable({
  nodes,
  isLoading,
  canRead,
  canWrite,
  onOpenDetail,
  onCordon,
  onUncordon,
  onPreviewDrain,
  onDrain,
}: NodesTableProps) {
  return (
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
          {nodes.map((node) => (
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
                  <button onClick={() => void onCordon(node.name)} className="btn-sm" disabled={!canWrite}>
                    Cordon
                  </button>
                  <button onClick={() => void onUncordon(node.name)} className="btn-sm" disabled={!canWrite}>
                    Uncordon
                  </button>
                  <button onClick={() => void onPreviewDrain(node.name)} className="btn-sm" disabled={!canWrite}>
                    Preview Drain
                  </button>
                  <button onClick={() => void onDrain(node.name)} className="btn-sm" disabled={!canWrite}>
                    Drain
                  </button>
                  <button onClick={() => void onOpenDetail(node.name)} className="btn-sm" disabled={!canRead}>
                    Details
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {isLoading && <p className="px-4 py-8 text-center text-sm text-zinc-500">Loading nodes...</p>}
      {!isLoading && nodes.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-zinc-500">No nodes found.</p>
      )}
    </div>
  );
}
