interface MetricsHeaderProps {
  autoRefresh: boolean;
  isLoading: boolean;
  onAutoRefreshChange: (value: boolean) => void;
  onRefresh: () => void;
}

export function MetricsHeader({ autoRefresh, isLoading, onAutoRefreshChange, onRefresh }: MetricsHeaderProps) {
  return (
    <header className="surface p-6 text-zinc-100">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400">Operations Metrics</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Cluster Telemetry</h2>
          <p className="text-sm text-zinc-300 mt-2 max-w-2xl">
            Charts are selected by data semantics: trends use lines, comparisons use grouped bars, and composition uses
            stacked bars.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-300 rounded-xl border border-zinc-700 px-3 py-2 bg-zinc-800/50">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => onAutoRefreshChange(event.target.checked)}
            />
            Auto refresh (15s)
          </label>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="h-10 rounded-xl border border-zinc-700 px-4 text-sm font-medium text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
          >
            {isLoading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>
    </header>
  );
}
