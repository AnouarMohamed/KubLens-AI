import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthSession } from "../../context/AuthSessionContext";
import { api } from "../../lib/api";
import type { AuditEntry, DiagnosticsResult, Incident, PredictionsResult, RemediationProposal } from "../../types";

interface ShiftSnapshot {
  diagnostics: DiagnosticsResult;
  predictions: PredictionsResult;
  incidents: Incident[];
  remediations: RemediationProposal[];
  audit: AuditEntry[];
}

export default function ShiftBrief() {
  const { can } = useAuthSession();
  const canRead = can("read");
  const [snapshot, setSnapshot] = useState<ShiftSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) {
      setSnapshot(null);
      setError("Authenticate to view shift briefing data.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [diagnostics, predictions, incidents, remediations, audit] = await Promise.all([
        api.getDiagnostics(),
        api.getPredictions(),
        api.listIncidents(),
        api.listRemediation(),
        api.getAuditLog(25),
      ]);

      setSnapshot({
        diagnostics,
        predictions,
        incidents,
        remediations,
        audit: audit.items,
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shift brief");
    } finally {
      setIsLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    void load();
  }, [load]);

  const criticalPredictions = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return snapshot.predictions.items.filter((item) => item.riskScore >= 80).slice(0, 5);
  }, [snapshot]);

  const openIncidents = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return snapshot.incidents.filter((incident) => incident.status === "open");
  }, [snapshot]);

  const pendingRemediations = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return snapshot.remediations.filter((item) => item.status === "proposed" || item.status === "approved");
  }, [snapshot]);

  const recentMutations = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    return snapshot.audit
      .filter((entry) => ["POST", "PUT", "PATCH", "DELETE"].includes(entry.method.toUpperCase()))
      .slice(0, 8);
  }, [snapshot]);

  return (
    <div className="space-y-5">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Shift Brief</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Live handoff view for on-call transitions: risk posture, active incidents, and recent changes.
          </p>
        </div>
        <button onClick={() => void load()} className="btn-sm" disabled={isLoading || !canRead}>
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {error && <div className="rounded-md border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</div>}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <BriefTile label="Health score" value={snapshot ? String(snapshot.diagnostics.healthScore) : "-"} note="Diagnostics engine" />
        <BriefTile label="Open incidents" value={String(openIncidents.length)} note="Incident commander queue" />
        <BriefTile label="Critical predictions" value={String(criticalPredictions.length)} note="Risk score >= 80" />
        <BriefTile label="Pending remediation" value={String(pendingRemediations.length)} note="Proposed or approved actions" />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Top predicted risks</p>
          <div className="mt-2 space-y-2">
            {criticalPredictions.map((item) => (
              <div key={item.id} className="rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                <p className="text-sm font-medium text-zinc-100">
                  {item.namespace ? `${item.namespace}/` : ""}
                  {item.resource}
                </p>
                <p className="text-xs text-zinc-400 mt-1">{item.summary}</p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Risk {item.riskScore} | Confidence {item.confidence}
                </p>
              </div>
            ))}
            {criticalPredictions.length === 0 && <p className="text-sm text-zinc-500">No critical predictions in the latest snapshot.</p>}
          </div>
        </div>

        <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Open incidents</p>
          <div className="mt-2 space-y-2">
            {openIncidents.slice(0, 6).map((incident) => (
              <div key={incident.id} className="rounded-md border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                <p className="text-sm font-medium text-zinc-100">{incident.title}</p>
                <p className="text-xs text-zinc-400 mt-1">{incident.summary}</p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {incident.severity.toUpperCase()} | opened {formatTimestamp(incident.openedAt)}
                </p>
              </div>
            ))}
            {openIncidents.length === 0 && <p className="text-sm text-zinc-500">No open incidents.</p>}
          </div>
        </div>
      </section>

      <section className="rounded-md border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Recent mutating actions</p>
        <div className="mt-2 overflow-auto rounded-md border border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-semibold">Time</th>
                <th className="px-3 py-2 font-semibold">User</th>
                <th className="px-3 py-2 font-semibold">Action</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-200">
              {recentMutations.map((entry) => (
                <tr key={`${entry.id}-${entry.timestamp}`}>
                  <td className="px-3 py-2 text-zinc-400">{formatTimestamp(entry.timestamp)}</td>
                  <td className="px-3 py-2">{entry.user || "unknown"}</td>
                  <td className="px-3 py-2 font-medium">{entry.action || `${entry.method} ${entry.path}`}</td>
                  <td className="px-3 py-2">{entry.status}</td>
                </tr>
              ))}
              {recentMutations.length === 0 && (
                <tr>
                  <td className="px-3 py-8 text-center text-zinc-500" colSpan={4}>
                    No recent mutating actions.
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

function BriefTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-zinc-100">{value}</p>
      <p className="text-xs text-zinc-400">{note}</p>
    </div>
  );
}

function formatTimestamp(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return "-";
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date.toLocaleString();
}
