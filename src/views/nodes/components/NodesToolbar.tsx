/**
 * Toolbar controls for searching and refreshing the nodes list.
 */
interface NodesToolbarProps {
  search: string;
  isLoading: boolean;
  isRefreshDisabled: boolean;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
}

export function NodesToolbar({ search, isLoading, isRefreshDisabled, onSearchChange, onRefresh }: NodesToolbarProps) {
  return (
    <div className="flex gap-2">
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search nodes"
        className="field w-72"
      />
      <button onClick={onRefresh} disabled={isRefreshDisabled} className="btn">
        {isLoading ? "Loading" : "Refresh"}
      </button>
    </div>
  );
}
