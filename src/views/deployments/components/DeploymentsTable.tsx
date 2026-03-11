import type { ResourceRecord } from "../../../types";

interface DeploymentsTableProps {
  items: ResourceRecord[];
  isLoading: boolean;
  isActing: boolean;
  canWrite: boolean;
  onOpenDetail: (item: ResourceRecord) => Promise<void>;
  onOpenScale: (item: ResourceRecord) => void;
  onRestart: (item: ResourceRecord) => Promise<void>;
  onRollback: (item: ResourceRecord) => Promise<void>;
  onOpenYAMLEditor: (item: ResourceRecord) => Promise<void>;
}

export function DeploymentsTable({
  items,
  isLoading,
  isActing,
  canWrite,
  onOpenDetail,
  onOpenScale,
  onRestart,
  onRollback,
  onOpenYAMLEditor,
}: DeploymentsTableProps) {
  return (
    <div className="table-shell">
      <table className="min-w-full text-left text-sm">
        <thead className="table-head table-head-sticky">
          <tr>
            <th className="px-4 py-3 font-semibold">Deployment</th>
            <th className="px-4 py-3 font-semibold">Namespace</th>
            <th className="px-4 py-3 font-semibold">Rollout Status</th>
            <th className="px-4 py-3 font-semibold">Age</th>
            <th className="px-4 py-3 font-semibold">Summary</th>
            <th className="px-4 py-3 font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800 text-zinc-200">
          {items.map((item) => (
            <tr key={item.id} className="table-row">
              <td className="px-4 py-3">
                <button onClick={() => void onOpenDetail(item)} className="font-medium hover:underline">
                  {item.name}
                </button>
              </td>
              <td className="px-4 py-3 text-zinc-400">{item.namespace ?? "-"}</td>
              <td className="px-4 py-3">{item.status}</td>
              <td className="px-4 py-3 text-zinc-400">{item.age}</td>
              <td className="px-4 py-3 text-zinc-400">{item.summary || "-"}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onOpenScale(item)}
                    disabled={!canWrite || isActing}
                    className="btn-sm border-zinc-600"
                  >
                    Scale
                  </button>
                  <button
                    onClick={() => void onRestart(item)}
                    disabled={!canWrite || isActing}
                    className="btn-sm border-zinc-600"
                  >
                    Restart
                  </button>
                  <button
                    onClick={() => void onRollback(item)}
                    disabled={!canWrite || isActing}
                    className="btn-sm border-zinc-600"
                  >
                    Rollback
                  </button>
                  <button
                    onClick={() => void onOpenYAMLEditor(item)}
                    disabled={!canWrite || isActing}
                    className="btn-sm border-zinc-600"
                  >
                    YAML
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!isLoading && items.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-zinc-500">No deployments match the current filters.</p>
      )}
    </div>
  );
}
