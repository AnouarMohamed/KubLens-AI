import type { PodStatusFilter } from "../hooks/usePodsData";

/**
 * Filter controls for pod inventory.
 */
interface PodsFiltersProps {
  search: string;
  namespaceFilter: string;
  statusFilter: PodStatusFilter;
  namespaces: string[];
  statuses: readonly PodStatusFilter[];
  onSearchChange: (value: string) => void;
  onNamespaceFilterChange: (value: string) => void;
  onStatusFilterChange: (value: PodStatusFilter) => void;
}

export function PodsFilters({
  search,
  namespaceFilter,
  statusFilter,
  namespaces,
  statuses,
  onSearchChange,
  onNamespaceFilterChange,
  onStatusFilterChange,
}: PodsFiltersProps) {
  return (
    <div className="flex gap-2">
      <input
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search pods"
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
      <select
        value={statusFilter}
        onChange={(event) => onStatusFilterChange(event.target.value as PodStatusFilter)}
        className="field"
      >
        {statuses.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </div>
  );
}
