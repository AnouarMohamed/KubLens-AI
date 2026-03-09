import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import type { AuditEntry, StreamEvent } from "../../types";

const MAX_ROWS = 300;

export default function AuditView() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const filteredRows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (needle === "") {
      return rows;
    }
    return rows.filter((row) => {
      const text = `${row.method} ${row.path} ${row.user ?? ""} ${row.role ?? ""} ${row.action ?? ""}`.toLowerCase();
      return text.includes(needle);
    });
  }, [rows, filter]);

  const loadAudit = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditLog(150);
      setRows(data.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAudit();
  }, []);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let cancelled = false;

    const connectStream = async () => {
      try {
        const session = await api.getAuthSession();
        if (cancelled) {
          return;
        }
        if (session.enabled && !session.authenticated) {
          setConnected(false);
          setError("Authenticate from Profile to enable live stream.");
          return;
        }
      } catch {
        // Keep trying to open stream in local mode.
      }

      socket = new WebSocket(api.getStreamWSURL());
      socket.onopen = () => {
        setConnected(true);
        setError(null);
      };
      socket.onmessage = (event) => {
        const payload = parseWSStreamEvent<AuditEntry>(event.data);
        if (!payload || payload.type !== "audit") {
          return;
        }
        setRows((current) => [payload.payload, ...current].slice(0, MAX_ROWS));
      };
      socket.onerror = () => {
        setConnected(false);
      };
    };

    void connectStream();
    return () => {
      cancelled = true;
      socket?.close();
      setConnected(false);
    };
  }, []);

  return (
    <div className="space-y-4">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Audit Trail</h2>
          <p className="text-sm text-zinc-500 mt-1">Live operator activity stream with request-level attribution.</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${connected ? "border-emerald-500/40 text-emerald-300" : "border-zinc-600 text-zinc-400"}`}
          >
            {connected ? "Stream connected" : "Stream disconnected"}
          </span>
          <button onClick={() => void loadAudit()} className="btn">
            Refresh
          </button>
        </div>
      </header>

      <section className="surface p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by user, action, path, method"
            className="field"
          />
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400">
            Showing <span className="text-zinc-100">{filteredRows.length}</span> rows
          </div>
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs text-zinc-400">
            Total cached <span className="text-zinc-100">{rows.length}</span>
          </div>
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
        )}

        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-900">
              <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Path</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-zinc-500">
                    Loading audit entries...
                  </td>
                </tr>
              )}
              {!loading &&
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-800 text-zinc-300">
                    <td className="px-3 py-2 text-xs text-zinc-400">{formatTime(row.timestamp)}</td>
                    <td className="px-3 py-2">
                      <span className="text-zinc-100">{row.user ?? "unknown"}</span>
                      {row.role && <span className="ml-2 text-xs text-zinc-500">({row.role})</span>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{row.method}</td>
                    <td className="px-3 py-2">{row.action ?? "-"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-zinc-400">{row.path}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs ${row.success ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-400">{row.durationMs}ms</td>
                  </tr>
                ))}
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                    No matching audit entries.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function parseWSStreamEvent<T>(data: string): StreamEvent<T> | null {
  try {
    return JSON.parse(data) as StreamEvent<T>;
  } catch {
    return null;
  }
}

function formatTime(value: string): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
