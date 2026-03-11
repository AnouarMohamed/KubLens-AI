interface PredictionsHeaderProps {
  autoRefresh: boolean;
  isLoading: boolean;
  onAutoRefreshChange: (enabled: boolean) => void;
  onRefresh: () => void;
}

export function PredictionsHeader({ autoRefresh, isLoading, onAutoRefreshChange, onRefresh }: PredictionsHeaderProps) {
  return (
    <header className="surface p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">Predictive Incidents</h2>
          <p className="mt-1 text-sm text-zinc-400">Forecasted incidents ranked by risk and confidence.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="rounded-lg border border-zinc-700 bg-zinc-800/70 px-3 py-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => onAutoRefreshChange(event.target.checked)}
            />
            <span className="ml-2">Auto refresh</span>
          </label>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="h-10 rounded-xl border border-zinc-700 px-4 text-sm font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            {isLoading ? "Refreshing" : "Refresh"}
          </button>
        </div>
      </div>
    </header>
  );
}
