import { ArrowRight, Bell, Settings, User } from "lucide-react";
import type { RefObject } from "react";
import type { ClusterContextList, RuntimeStatus } from "../../types";
import type { ViewItem } from "../../features/viewCatalog";
import type { NotificationStatus } from "../hooks/useNotifications";

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
  notificationStatus: NotificationStatus;
  notificationUnreadCount: number;
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
  notificationStatus,
  notificationUnreadCount,
  searchRef,
}: HeaderBarProps) {
  const modePrompt = runtime ? `[${runtime.mode}:${runtime.isRealCluster ? "real" : "mock"}]` : null;
  const unreadLabel = notificationUnreadCount > 99 ? "99+" : String(notificationUnreadCount);

  return (
    <header className="h-16 border-b border-zinc-700 flex items-center justify-between px-6 bg-zinc-900">
      <div>
        <h2 className="text-base text-zinc-100 tracking-tight">{currentViewMeta.label}</h2>
        <p className="text-xs text-zinc-500 mt-0.5">{currentViewMeta.kubectlCommand}</p>
      </div>

      <div className="flex items-center gap-2">
        {modePrompt && <span className="text-[11px] text-zinc-500">{modePrompt}</span>}

        {runtime?.predictorEnabled && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-300">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                runtime.predictorHealthy ? "bg-[var(--green)]" : "bg-[var(--amber)]"
              }`}
            />
            predictor
          </span>
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

        <label className="field-command">
          <span>&gt;_</span>
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && onSearchSubmit()}
            placeholder="search views (/)"
            className="field w-72"
          />
        </label>

        <button onClick={onSearchSubmit} className="icon-btn" aria-label="Execute search">
          <ArrowRight size={16} />
        </button>
        <button onClick={onToggleNotifications} className="icon-btn relative" aria-label="Notifications">
          <Bell size={16} />
          {notificationUnreadCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-4 rounded-full border border-zinc-700 bg-zinc-800 px-1 text-[10px] leading-4 text-zinc-100">
              {unreadLabel}
            </span>
          )}
          {notificationStatus !== "idle" && (
            <span
              className={`absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full ${notificationDotClass(notificationStatus)}`}
            />
          )}
        </button>
        <button onClick={onToggleSettings} className="icon-btn" aria-label="Settings">
          <Settings size={16} />
        </button>
        <button onClick={onToggleProfile} className="icon-btn" aria-label="Profile">
          <User size={16} />
        </button>
      </div>
    </header>
  );
}

function notificationDotClass(status: NotificationStatus): string {
  switch (status) {
    case "live":
      return "bg-[var(--green)]";
    case "reconnecting":
      return "bg-[var(--amber)]";
    case "blocked":
      return "bg-[var(--red)]";
    case "snapshot":
      return "bg-[var(--blue)]";
    default:
      return "bg-zinc-500";
  }
}
