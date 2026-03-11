interface DeploymentsHeaderProps {
  search: string;
  namespaceFilter: string;
  namespaces: string[];
  isLoading: boolean;
  isActing: boolean;
  canRead: boolean;
  onSearchChange: (value: string) => void;
  onNamespaceFilterChange: (value: string) => void;
  onRefresh: () => void;
}

export function DeploymentsHeader({
  search,
  namespaceFilter,
  namespaces,
  isLoading,
  isActing,
  canRead,
  onSearchChange,
  onNamespaceFilterChange,
  onRefresh,
}: DeploymentsHeaderProps) {
  return (
    <header className="panel-head">
      <div>
        <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Deployments</h2>
        <p className="text-sm text-zinc-400 mt-1">Specialized rollout controls with detail and YAML workflows.</p>
      </div>
      <div className="flex gap-2">
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search deployments"
          className="field w-72"
        />
        <select
          value={namespaceFilter}
          onChange={(event) => onNamespaceFilterChange(event.target.value)}
          className="field"
        >
          <option value="All">All namespaces</option>
          {namespaces.map((namespace) => (
            <option key={namespace} value={namespace}>
              {namespace}
            </option>
          ))}
        </select>
        <button onClick={onRefresh} disabled={isLoading || isActing || !canRead} className="btn">
          {isLoading ? "Loading" : "Refresh"}
        </button>
      </div>
    </header>
  );
}
