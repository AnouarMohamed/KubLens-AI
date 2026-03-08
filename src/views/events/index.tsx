import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthSession } from "../../context/AuthSessionContext";
import { api } from "../../lib/api";
import type { K8sEvent } from "../../types";

const EVENT_TYPES = ["All", "Warning", "Normal"] as const;

export default function Events() {
  const { can, isLoading: authLoading } = useAuthSession();
  const [events, setEvents] = useState<K8sEvent[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<(typeof EVENT_TYPES)[number]>("All");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canRead = can("read");

  const load = useCallback(async () => {
    if (!canRead) {
      setEvents([]);
      setError("Authenticate to view cluster events.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const rows = await api.getEvents();
      setEvents(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setIsLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    void load();
  }, [authLoading, load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return events.filter((event) => {
      const matchesType = typeFilter === "All" || event.type === typeFilter;
      const matchesSearch =
        query === "" || `${event.type} ${event.reason} ${event.from} ${event.message}`.toLowerCase().includes(query);
      return matchesType && matchesSearch;
    });
  }, [events, search, typeFilter]);

  const warningsCount = useMemo(() => events.filter((event) => event.type === "Warning").length, [events]);
  const uniqueReasons = useMemo(() => new Set(events.map((event) => event.reason).filter(Boolean)).size, [events]);

  return (
    <div className="space-y-5">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Events</h2>
          <p className="text-sm text-zinc-400 mt-1">Chronological cluster signals for troubleshooting and audits.</p>
        </div>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search events"
            className="field w-72"
          />
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as (typeof EVENT_TYPES)[number])}
            className="field"
          >
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button onClick={() => void load()} disabled={isLoading || !canRead} className="btn">
            {isLoading ? "Loading" : "Refresh"}
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Visible Events" value={String(filtered.length)} />
        <Kpi label="Total Events" value={String(events.length)} />
        <Kpi label="Warnings" value={String(warningsCount)} />
        <Kpi label="Unique Reasons" value={String(uniqueReasons)} />
      </section>

      {error && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">{error}</div>
      )}

      <div className="table-shell">
        <table className="min-w-full text-left text-sm">
          <thead className="table-head table-head-sticky">
            <tr>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Reason</th>
              <th className="px-4 py-3 font-semibold">Age</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Count</th>
              <th className="px-4 py-3 font-semibold">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 text-zinc-200">
            {filtered.map((event, index) => (
              <tr key={`${event.reason}-${event.age}-${index}`} className="table-row">
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      event.type === "Warning" ? "bg-amber-200 text-amber-900" : "bg-emerald-200 text-emerald-900"
                    }`}
                  >
                    {event.type || "Unknown"}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium">{event.reason || "-"}</td>
                <td className="px-4 py-3 text-zinc-400">{event.age || "-"}</td>
                <td className="px-4 py-3 text-zinc-400">{event.from || "-"}</td>
                <td className="px-4 py-3 text-zinc-400">{event.count ?? "-"}</td>
                <td className="px-4 py-3 text-zinc-300">{event.message || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {isLoading && <p className="px-4 py-8 text-center text-sm text-zinc-500">Loading events...</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">No events match the current filters.</p>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <article className="kpi">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">{value}</p>
    </article>
  );
}
