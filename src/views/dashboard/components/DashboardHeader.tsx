import type { ClusterStats } from "../../../types";

interface DashboardHeaderProps {
  stats: ClusterStats | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export function DashboardHeader({ stats, isLoading, onRefresh }: DashboardHeaderProps) {
  return (
    <header className="flex items-center justify-between mb-6">
      <div>
        <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#666666]">cluster overview</p>
        <p className="mt-1 text-lg font-mono font-semibold text-[#e8e8e8]">
          {stats ? `${stats.pods.total} pods | ${stats.nodes.ready}/${stats.nodes.total} nodes ready` : "loading..."}
        </p>
      </div>
      <button onClick={onRefresh} disabled={isLoading} className="btn-sm font-mono">
        {isLoading ? "refreshing..." : "refresh"}
      </button>
    </header>
  );
}
