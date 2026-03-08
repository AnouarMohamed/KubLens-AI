import type { RefObject } from "react";
import type { ClusterContextList, RuntimeStatus } from "../../types";
import type { ViewItem } from "../../features/viewCatalog";

interface HeaderBarProps {
  currentViewMeta: ViewItem;
  clusterContexts: ClusterContextList | null;
  runtime: RuntimeStatus | null;
  isSwitchingCluster: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onSelectCluster: (name: string) => void;
  onToggleNotifications: () => void;
  onToggleSettings: () => void;
  onToggleProfile: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
}

export function HeaderBar({
  currentViewMeta,
  clusterContexts,
  runtime,
  isSwitchingCluster,
  search,
  onSearchChange,
  onSearchSubmit,
  onSelectCluster,
  onToggleNotifications,
  onToggleSettings,
  onToggleProfile,
  searchRef,
}: HeaderBarProps) {
  return (
    <header className="h-16 border-b border-zinc-700 flex items-center justify-between px-6 bg-zinc-900/92">
      <div>
        <h2 className="text-base font-semibold text-zinc-100 tracking-tight">{currentViewMeta.label}</h2>
        <p className="text-xs text-zinc-400 mt-0.5 font-mono">{currentViewMeta.kubectlCommand}</p>
      </div>

      <div className="flex items-center gap-2">
        {runtime && (
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-zinc-600 px-2 py-1 text-[11px] uppercase tracking-wide text-zinc-300">
              {runtime.mode} / {runtime.isRealCluster ? "real" : "mock"}
            </span>
            {runtime.predictorEnabled && (
              <span
                className={`rounded-md border px-2 py-1 text-[11px] uppercase tracking-wide ${
                  runtime.predictorHealthy
                    ? "border-emerald-500/50 text-emerald-300"
                    : "border-amber-500/50 text-amber-300"
                }`}
              >
                predictor {runtime.predictorHealthy ? "ok" : "degraded"}
              </span>
            )}
          </div>
        )}
        {clusterContexts && clusterContexts.items.length > 1 && (
          <select
            value={clusterContexts.selected}
            disabled={isSwitchingCluster}
            onChange={(event) => onSelectCluster(event.target.value)}
            className="field h-10 min-w-44"
          >
            {clusterContexts.items.map((item) => (
              <option key={item.name} value={item.name}>
                {item.name} {item.isRealCluster ? "(real)" : "(mock)"}
              </option>
            ))}
          </select>
        )}
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && onSearchSubmit()}
          placeholder="Search views ( / )"
          className="field w-72"
        />
        <TopButton onClick={onSearchSubmit} label="Go" />
        <TopButton onClick={onToggleNotifications} label="Notifications" />
        <TopButton onClick={onToggleSettings} label="Settings" />
        <TopButton onClick={onToggleProfile} label="Profile" />
      </div>
    </header>
  );
}

function TopButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="btn">
      {label}
    </button>
  );
}
