/**
 * Header actions for the pods view.
 */
interface PodsHeaderProps {
  canWrite: boolean;
  showCreateForm: boolean;
  canRead: boolean;
  isLoading: boolean;
  isBusy: boolean;
  onToggleCreateForm: () => void;
  onRefresh: () => void;
}

export function PodsHeader({
  canWrite,
  showCreateForm,
  canRead,
  isLoading,
  isBusy,
  onToggleCreateForm,
  onRefresh,
}: PodsHeaderProps) {
  return (
    <header className="panel-head">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Pods</h2>
        <p className="text-sm text-zinc-400 mt-1">Workload inventory with operational actions.</p>
      </div>
      <div className="flex gap-2">
        {canWrite && (
          <button onClick={onToggleCreateForm} className="btn">
            {showCreateForm ? "Close Create" : "Create Pod"}
          </button>
        )}
        <button onClick={onRefresh} disabled={isLoading || isBusy || !canRead} className="btn">
          {isLoading ? "Loading" : "Refresh"}
        </button>
      </div>
    </header>
  );
}
