import { useMemo, useState } from "react";
import type { K8sEvent } from "../../../types";

interface NodeEventsTabProps {
  orderedNodeEvents: K8sEvent[];
}

export function NodeEventsTab({ orderedNodeEvents }: NodeEventsTabProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "warning" | "normal">("all");

  const filteredEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orderedNodeEvents.filter((event) => {
      const type = (event.type ?? "").toLowerCase();
      if (typeFilter === "warning" && type !== "warning") {
        return false;
      }
      if (typeFilter === "normal" && type !== "normal") {
        return false;
      }
      if (needle === "") {
        return true;
      }
      return `${event.type} ${event.reason} ${event.message} ${event.from}`.toLowerCase().includes(needle);
    });
  }, [orderedNodeEvents, query, typeFilter]);

  return (
    <section className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Node event timeline</p>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by reason, message, or source"
            className="input flex-1 min-w-[220px]"
          />
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as "all" | "warning" | "normal")} className="input w-[170px]">
            <option value="all">All Types</option>
            <option value="warning">Warning only</option>
            <option value="normal">Normal only</option>
          </select>
        </div>
        <p className="text-xs text-zinc-500">
          Showing {filteredEvents.length} of {orderedNodeEvents.length} events
        </p>
      </div>

      <div className="rounded-md border border-zinc-800 overflow-hidden">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Reason</th>
              <th className="px-4 py-3 font-semibold">Age</th>
              <th className="px-4 py-3 font-semibold">From</th>
              <th className="px-4 py-3 font-semibold">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 text-zinc-200">
            {filteredEvents.map((event, index) => (
              <tr key={`${event.reason}-${event.lastTimestamp ?? index}`}>
                <td className="px-4 py-3">{event.type || "-"}</td>
                <td className="px-4 py-3 font-medium">{event.reason || "-"}</td>
                <td className="px-4 py-3 text-zinc-400">{event.age || "-"}</td>
                <td className="px-4 py-3 text-zinc-400">{event.from || "-"}</td>
                <td className="px-4 py-3 text-zinc-400">{event.message || "-"}</td>
              </tr>
            ))}
            {filteredEvents.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-zinc-500" colSpan={5}>
                  No events match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
