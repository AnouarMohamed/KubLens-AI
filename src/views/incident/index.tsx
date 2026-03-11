import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthSession } from "../../context/AuthSessionContext";
import { api } from "../../lib/api";
import type {
  Incident,
  MemoryFixCreateRequest,
  RemediationProposal,
  RunbookStep,
  RunbookStepStatus,
  TimelineEntry,
} from "../../types";

export default function IncidentView() {
  const { can } = useAuthSession();
  const canRead = can("read");
  const canWrite = can("write");

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [remediations, setRemediations] = useState<RemediationProposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fixPromptDismissed, setFixPromptDismissed] = useState(false);
  const [fixForm, setFixForm] = useState<MemoryFixCreateRequest | null>(null);

  const refreshIncidents = useCallback(async () => {
    if (!canRead) {
      setError("Authenticate to view incidents.");
      setIncidents([]);
      setSelected(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const data = await api.listIncidents();
      setIncidents(data);
      if (selected?.id) {
        const fresh = data.find((item) => item.id === selected.id);
        if (fresh) {
          setSelected(fresh);
        }
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load incidents");
    } finally {
      setIsLoading(false);
    }
  }, [canRead, selected?.id]);

  const loadIncidentDetail = useCallback(async (id: string) => {
    setIsActing(true);
    try {
      const data = await api.getIncident(id);
      setSelected(data);
      setFixPromptDismissed(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load incident detail");
    } finally {
      setIsActing(false);
    }
  }, []);

  const refreshRemediations = useCallback(async () => {
    try {
      const data = await api.listRemediation();
      setRemediations(data);
    } catch {
      setRemediations([]);
    }
  }, []);

  useEffect(() => {
    void refreshIncidents();
  }, [refreshIncidents]);

  useEffect(() => {
    if (!selected || selected.status !== "resolved") {
      setFixForm(null);
      return;
    }
    void refreshRemediations();
  }, [selected, refreshRemediations]);

  const associatedExecutedRemediations = useMemo(() => {
    if (!selected) {
      return [];
    }
    const ids = new Set(selected.associatedRemediationIds);
    return remediations.filter((proposal) => ids.has(proposal.id) && proposal.status === "executed");
  }, [selected, remediations]);

  useEffect(() => {
    if (
      !selected ||
      selected.status !== "resolved" ||
      associatedExecutedRemediations.length === 0 ||
      fixPromptDismissed
    ) {
      return;
    }
    const first = associatedExecutedRemediations[0];
    setFixForm({
      incidentId: selected.id,
      proposalId: first.id,
      title: `${formatKind(first.kind)} fix for ${first.resource}`,
      description: first.executionResult || first.reason,
      resource: first.namespace ? `${first.namespace}/${first.resource}` : first.resource,
      kind: first.kind,
    });
  }, [associatedExecutedRemediations, fixPromptDismissed, selected]);

  const triggerIncident = useCallback(async () => {
    if (!canRead) {
      return;
    }
    setIsActing(true);
    try {
      const created = await api.createIncident();
      setMessage(`Incident ${created.id} created.`);
      await refreshIncidents();
      await loadIncidentDetail(created.id);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger incident");
    } finally {
      setIsActing(false);
    }
  }, [canRead, loadIncidentDetail, refreshIncidents]);

  const applyStepStatus = useCallback(
    async (step: RunbookStep, target: RunbookStepStatus) => {
      if (!selected || !canWrite) {
        return;
      }
      setIsActing(true);
      try {
        const updated = await api.updateIncidentStep(selected.id, step.id, { status: target });
        setSelected(updated);
        setMessage(`Step ${step.id} updated to ${target}.`);
        await refreshIncidents();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update step");
      } finally {
        setIsActing(false);
      }
    },
    [canWrite, refreshIncidents, selected],
  );

  const cycleStep = useCallback(
    async (step: RunbookStep) => {
      if (!canWrite) {
        return;
      }
      const target = nextStepStatus(step.status);
      if (!target) {
        return;
      }
      await applyStepStatus(step, target);
    },
    [applyStepStatus, canWrite],
  );

  const resolveIncident = useCallback(async () => {
    if (!selected || !canWrite) {
      return;
    }
    setIsActing(true);
    try {
      const updated = await api.resolveIncident(selected.id);
      setSelected(updated);
      setMessage(`Incident ${updated.id} resolved.`);
      await refreshIncidents();
      await refreshRemediations();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve incident");
    } finally {
      setIsActing(false);
    }
  }, [canWrite, refreshIncidents, refreshRemediations, selected]);

  const generatePostmortem = useCallback(async () => {
    if (!selected || !canWrite) {
      return;
    }
    setIsActing(true);
    try {
      const created = await api.generatePostmortem(selected.id);
      setMessage(`Postmortem ${created.id} generated (${created.method.toUpperCase()}).`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate postmortem");
    } finally {
      setIsActing(false);
    }
  }, [canWrite, selected]);

  const saveFix = useCallback(async () => {
    if (!fixForm || !canWrite) {
      return;
    }
    setIsActing(true);
    try {
      await api.recordMemoryFix(fixForm);
      setMessage("Fix pattern recorded in cluster memory.");
      setFixForm(null);
      setFixPromptDismissed(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record fix");
    } finally {
      setIsActing(false);
    }
  }, [canWrite, fixForm]);

  const canResolve = useMemo(() => {
    if (!selected || selected.status !== "open") {
      return false;
    }
    return selected.runbook.every((step) => step.status === "done" || step.status === "skipped");
  }, [selected]);

  if (selected) {
    return (
      <div className="space-y-4">
        <header className="panel-head">
          <div>
            <button onClick={() => setSelected(null)} className="btn-sm border-zinc-600">
              Back to Incidents
            </button>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-100 tracking-tight">{selected.title}</h2>
            <p className="text-sm text-zinc-400 mt-1">
              {selected.id} • {selected.severity.toUpperCase()} • {selected.status.toUpperCase()}
            </p>
          </div>
          <div className="flex gap-2">
            {selected.status === "open" && (
              <button
                onClick={() => void resolveIncident()}
                disabled={!canWrite || !canResolve || isActing}
                className="btn-primary"
              >
                Resolve Incident
              </button>
            )}
            {selected.status === "resolved" && (
              <button onClick={() => void generatePostmortem()} disabled={!canWrite || isActing} className="btn">
                Generate Postmortem
              </button>
            )}
            <button onClick={() => void loadIncidentDetail(selected.id)} disabled={isActing} className="btn">
              Refresh
            </button>
          </div>
        </header>

        {message && <Banner tone="ok" text={message} />}
        {error && <Banner tone="err" text={error} />}

        {fixForm && (
          <section className="surface p-4 space-y-3">
            <p className="text-sm font-semibold text-zinc-100">Record this fix for future reference?</p>
            <p className="text-xs text-zinc-400">
              This incident has an executed remediation. Save a reusable fix pattern to cluster memory.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs text-zinc-400">
                Title
                <input
                  value={fixForm.title}
                  onChange={(event) =>
                    setFixForm((current) => (current ? { ...current, title: event.target.value } : null))
                  }
                  className="field mt-1 w-full"
                />
              </label>
              <label className="text-xs text-zinc-400">
                Resource
                <input
                  value={fixForm.resource}
                  onChange={(event) =>
                    setFixForm((current) => (current ? { ...current, resource: event.target.value } : null))
                  }
                  className="field mt-1 w-full"
                />
              </label>
            </div>
            <label className="text-xs text-zinc-400 block">
              Description
              <textarea
                value={fixForm.description}
                onChange={(event) =>
                  setFixForm((current) => (current ? { ...current, description: event.target.value } : null))
                }
                className="field mt-1 w-full min-h-24"
              />
            </label>
            <div className="flex gap-2">
              <button onClick={() => void saveFix()} disabled={!canWrite || isActing} className="btn-primary">
                Record Fix
              </button>
              <button
                onClick={() => {
                  setFixForm(null);
                  setFixPromptDismissed(true);
                }}
                className="btn"
              >
                Dismiss
              </button>
            </div>
          </section>
        )}

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="surface p-4">
            <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wide">Timeline</h3>
            <div className="mt-3 space-y-3">
              {selected.timeline.map((entry, idx) => (
                <TimelineCard key={`${entry.timestamp}-${idx}`} entry={entry} />
              ))}
              {selected.timeline.length === 0 && <p className="text-sm text-zinc-500">No timeline entries.</p>}
            </div>
          </article>

          <article className="surface p-4">
            <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wide">Runbook</h3>
            <div className="mt-3 space-y-3">
              {selected.runbook.map((step) => (
                <div
                  key={step.id}
                  className="rounded-md border border-zinc-700 bg-zinc-900/70 p-3 cursor-pointer"
                  onClick={() => void cycleStep(step)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-zinc-100">
                      {stepIcon(step.status)} {step.title}
                    </p>
                    <div className="flex gap-2">
                      {(step.status === "pending" || step.status === "in_progress") && !step.mandatory && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void applyStepStatus(step, "skipped");
                          }}
                          disabled={!canWrite || isActing}
                          className="btn-sm border-zinc-600"
                        >
                          Skip
                        </button>
                      )}
                      <span className="text-[11px] uppercase text-zinc-500">{step.status}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-zinc-300">{step.description}</p>
                  {step.command && (
                    <pre className="mt-2 overflow-x-auto rounded-md border border-zinc-700 bg-zinc-950 p-2 text-xs text-zinc-200">
                      <code>{step.command}</code>
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    );
  }

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
          <button onClick={() => void refreshIncidents()} disabled={isLoading || isActing} className="btn">
            {isLoading ? "Loading" : "Refresh"}
          </button>
          <button onClick={() => void triggerIncident()} disabled={!canRead || isActing} className="btn-primary">
            Trigger Incident
          </button>
        </div>
      </header>

      {message && <Banner tone="ok" text={message} />}
      {error && <Banner tone="err" text={error} />}

      <section className="table-shell">
        <table className="min-w-full text-left text-sm">
          <thead className="table-head table-head-sticky">
            <tr>
              <th className="px-4 py-3 font-semibold">Severity</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Title</th>
              <th className="px-4 py-3 font-semibold">Opened</th>
              <th className="px-4 py-3 font-semibold">Resources</th>
              <th className="px-4 py-3 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 text-zinc-200">
            {incidents.map((incident) => (
              <tr key={incident.id} className="table-row">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${incident.severity === "critical" ? "bg-[var(--red)]" : "bg-[var(--amber)]"}`}
                    />
                    <span className="capitalize">{incident.severity}</span>
                  </span>
                </td>
                <td className="px-4 py-3 capitalize">{incident.status}</td>
                <td className="px-4 py-3 font-medium">{incident.title}</td>
                <td className="px-4 py-3 text-zinc-400">{formatTimestamp(incident.openedAt)}</td>
                <td className="px-4 py-3">{incident.affectedResources.length}</td>
                <td className="px-4 py-3">
                  <button onClick={() => void loadIncidentDetail(incident.id)} className="btn-sm border-zinc-600">
                    View
                  </button>
                </td>
              </tr>
            ))}
            {!isLoading && incidents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  No incidents recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function nextStepStatus(current: RunbookStepStatus): RunbookStepStatus | null {
  if (current === "pending") {
    return "in_progress";
  }
  if (current === "in_progress") {
    return "done";
  }
  return null;
}

function stepIcon(status: RunbookStepStatus): string {
  switch (status) {
    case "in_progress":
      return "🔄";
    case "done":
      return "✅";
    case "skipped":
      return "⏭";
    default:
      return "⬜";
  }
}

function TimelineCard({ entry }: { entry: TimelineEntry }) {
  return (
    <article
      className={`rounded-md border border-zinc-700 bg-zinc-900/70 p-3 border-l-4 ${timelineBorderClass(entry.kind)}`}
    >
      <p className="text-xs text-zinc-500">
        {formatTimestamp(entry.timestamp)} • {entry.source}
      </p>
      <p className="mt-1 text-sm text-zinc-100">{entry.summary}</p>
      {entry.resource && <p className="mt-1 text-xs text-zinc-400">{entry.resource}</p>}
    </article>
  );
}

function timelineBorderClass(kind: TimelineEntry["kind"]): string {
  switch (kind) {
    case "diagnostic":
      return "border-l-[var(--red)]";
    case "event":
      return "border-l-[var(--amber)]";
    case "prediction":
      return "border-l-[var(--blue)]";
    case "action":
      return "border-l-[var(--accent)]";
    default:
      return "border-l-zinc-700";
  }
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatKind(kind: string): string {
  return kind.replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function Banner({ tone, text }: { tone: "ok" | "err"; text: string }) {
  if (tone === "ok") {
    return (
      <div className="rounded-md border border-[#00d4a8]/40 bg-[#00d4a8]/12 px-3 py-2 text-sm text-zinc-100">
        {text}
      </div>
    );
  }
  return <div className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">{text}</div>;
}
