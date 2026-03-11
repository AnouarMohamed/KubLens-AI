import type { Incident } from "../../../types";
import { formatTimestamp, incidentProgressLabel } from "../utils";
import { Banner, StatTile } from "./IncidentPrimitives";

interface IncidentListViewProps {
  canRead: boolean;
  isLoading: boolean;
  isActing: boolean;
  message: string | null;
  error: string | null;
  incidentStats: {
    total: number;
    open: number;
    criticalOpen: number;
    resolved: number;
  };
  filteredIncidents: Incident[];
  searchQuery: string;
  statusFilter: "all" | Incident["status"];
  severityFilter: "all" | "critical" | "warning";
  onSearchQueryChange: (value: string) => void;
  onStatusFilterChange: (value: "all" | Incident["status"]) => void;
  onSeverityFilterChange: (value: "all" | "critical" | "warning") => void;
  onRefresh: () => void;
  onTriggerIncident: () => void;
  onViewIncident: (id: string) => void;
}

export function IncidentListView({
  canRead,
  isLoading,
  isActing,
  message,
  error,
  incidentStats,
  filteredIncidents,
  searchQuery,
  statusFilter,
  severityFilter,
  onSearchQueryChange,
  onStatusFilterChange,
  onSeverityFilterChange,
  onRefresh,
  onTriggerIncident,
  onViewIncident,
}: IncidentListViewProps) {
  return (
    <div className="space-y-4">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Incident Commander</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Create incidents from live state and execute runbooks with audit-backed actions.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onRefresh} disabled={isLoading || isActing} className="btn">
            {isLoading ? "Loading" : "Refresh"}
          </button>
          <button onClick={onTriggerIncident} disabled={!canRead || isActing} className="btn-primary">
            Trigger Incident
          </button>
        </div>
      </header>

      {message && <Banner tone="ok" text={message} />}
      {error && <Banner tone="err" text={error} />}

      <section className="grid gap-3 md:grid-cols-4">
        <StatTile label="Total incidents" value={String(incidentStats.total)} tone="neutral" />
        <StatTile label="Open" value={String(incidentStats.open)} tone="warn" />
        <StatTile label="Critical open" value={String(incidentStats.criticalOpen)} tone="bad" />
        <StatTile label="Resolved" value={String(incidentStats.resolved)} tone="good" />
      </section>

      <section className="surface p-4 grid gap-2 md:grid-cols-4">
        <input
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="Search id, title, summary, resource"
          className="field md:col-span-2"
        />
        <select
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value as "all" | Incident["status"])}
          className="field"
        >
          <option value="all">All status</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={severityFilter}
          onChange={(event) => onSeverityFilterChange(event.target.value as "all" | "critical" | "warning")}
          className="field"
        >
          <option value="all">All severity</option>
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
        </select>
      </section>

      <section className="table-shell">
        <table className="min-w-full text-left text-sm">
          <thead className="table-head table-head-sticky">
            <tr>
              <th className="px-4 py-3 font-semibold">Severity</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Title</th>
              <th className="px-4 py-3 font-semibold">Opened</th>
              <th className="px-4 py-3 font-semibold">Progress</th>
              <th className="px-4 py-3 font-semibold">Resources</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 text-zinc-200">
            {filteredIncidents.map((incident) => {
              const progress = incidentProgressLabel(incident.runbook);
              return (
                <tr key={incident.id} className="table-row">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          incident.severity === "critical" ? "bg-[var(--red)]" : "bg-[var(--amber)]"
                        }`}
                      />
                      <span className="capitalize">{incident.severity}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize">{incident.status}</td>
                  <td className="px-4 py-3 font-medium">{incident.title}</td>
                  <td className="px-4 py-3 text-zinc-400">{formatTimestamp(incident.openedAt)}</td>
                  <td className="px-4 py-3 text-zinc-400">{progress}</td>
                  <td className="px-4 py-3">{incident.affectedResources.length}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => onViewIncident(incident.id)} className="btn-sm border-zinc-600">
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && filteredIncidents.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  No incidents match your current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
