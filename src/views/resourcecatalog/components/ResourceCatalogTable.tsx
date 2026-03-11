import type { ResourceRecord } from "../../../types";

interface ResourceCatalogTableProps {
  resources: ResourceRecord[];
  isLoading: boolean;
  isActing: boolean;
  canWrite: boolean;
  hasWorkloadActions: boolean;
  isScaleableView: boolean;
  isRestartableView: boolean;
  isRollbackView: boolean;
  onOpenYAMLEditor: (resource: ResourceRecord) => Promise<void>;
  onOpenScaleEditor: (resource: ResourceRecord) => void;
  onRestartResource: (resource: ResourceRecord) => Promise<void>;
  onRollbackResource: (resource: ResourceRecord) => Promise<void>;
}

function ActionButton({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className="btn-sm border-zinc-600">
      {label}
    </button>
  );
}

export function ResourceCatalogTable({
  resources,
  isLoading,
  isActing,
  canWrite,
  hasWorkloadActions,
  isScaleableView,
  isRestartableView,
  isRollbackView,
  onOpenYAMLEditor,
  onOpenScaleEditor,
  onRestartResource,
  onRollbackResource,
}: ResourceCatalogTableProps) {
  return (
    <div className="table-shell">
      <table className="min-w-full text-left">
        <thead className="table-head table-head-sticky">
          <tr>
            <th className="px-4 py-3 font-semibold">Name</th>
            <th className="px-4 py-3 font-semibold">Namespace</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Age</th>
            <th className="px-4 py-3 font-semibold">Summary</th>
            {hasWorkloadActions && <th className="px-4 py-3 font-semibold">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800 text-sm text-zinc-200">
          {resources.map((resource) => (
            <tr key={resource.id} className="table-row">
              <td className="px-4 py-3 font-medium">{resource.name}</td>
              <td className="px-4 py-3 text-zinc-400">{resource.namespace || "-"}</td>
              <td className="px-4 py-3">{resource.status}</td>
              <td className="px-4 py-3 text-zinc-400">{resource.age}</td>
              <td className="px-4 py-3 text-zinc-400">{resource.summary || "-"}</td>
              {hasWorkloadActions && (
                <td className="px-4 py-3">
                  {resource.namespace ? (
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        onClick={() => void onOpenYAMLEditor(resource)}
                        disabled={isActing || !canWrite}
                        label="Edit YAML"
                      />
                      {isScaleableView && (
                        <ActionButton
                          onClick={() => onOpenScaleEditor(resource)}
                          disabled={isActing || !canWrite}
                          label="Scale"
                        />
                      )}
                      {isRestartableView && (
                        <ActionButton
                          onClick={() => void onRestartResource(resource)}
                          disabled={isActing || !canWrite}
                          label="Restart"
                        />
                      )}
                      {isRollbackView && (
                        <button
                          onClick={() => void onRollbackResource(resource)}
                          disabled={isActing || !canWrite}
                          className="btn-sm border-zinc-600"
                        >
                          Rollback
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-500">Not available</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {!isLoading && resources.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-zinc-500">No resources found.</p>
      )}
    </div>
  );
}
