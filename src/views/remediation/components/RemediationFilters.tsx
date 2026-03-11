import type { RiskFilter, StatusFilter } from "../utils";

interface RemediationFiltersProps {
  searchQuery: string;
  statusFilter: StatusFilter;
  riskFilter: RiskFilter;
  onSearchQueryChange: (value: string) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
  onRiskFilterChange: (value: RiskFilter) => void;
}

export function RemediationFilters({
  searchQuery,
  statusFilter,
  riskFilter,
  onSearchQueryChange,
  onStatusFilterChange,
  onRiskFilterChange,
}: RemediationFiltersProps) {
  return (
    <section className="surface p-4 grid gap-2 md:grid-cols-4">
      <input
        value={searchQuery}
        onChange={(event) => onSearchQueryChange(event.target.value)}
        placeholder="Search id, kind, reason, resource"
        className="field md:col-span-2"
      />
      <select
        value={statusFilter}
        onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}
        className="field"
      >
        <option value="all">All status</option>
        <option value="proposed">Proposed</option>
        <option value="approved">Approved</option>
        <option value="executed">Executed</option>
        <option value="rejected">Rejected</option>
      </select>
      <select
        value={riskFilter}
        onChange={(event) => onRiskFilterChange(event.target.value as RiskFilter)}
        className="field"
      >
        <option value="all">All risk</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
    </section>
  );
}
