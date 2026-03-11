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

type TimelineFilter = "all" | TimelineEntry["kind"];

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
  const [statusFilter, setStatusFilter] = useState<"all" | Incident["status"]>("all");
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "warning">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");

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
      setTimelineFilter("all");
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

  const incidentStats = useMemo(() => {
    const open = incidents.filter((item) => item.status === "open");
    const criticalOpen = open.filter((item) => item.severity === "critical");
    return {
      total: incidents.length,
      open: open.length,
      criticalOpen: criticalOpen.length,
      resolved: incidents.length - open.length,
    };
  }, [incidents]);

  const filteredIncidents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return incidents.filter((incident) => {
      if (statusFilter !== "all" && incident.status !== statusFilter) {
        return false;
      }
      if (severityFilter !== "all" && incident.severity !== severityFilter) {
        return false;
      }
      if (query === "") {
        return true;
      }
      return `${incident.id} ${incident.title} ${incident.summary} ${incident.affectedResources.join(" ")}`
        .toLowerCase()
        .includes(query);
    });
  }, [incidents, searchQuery, severityFilter, statusFilter]);

  const runbookStats = useMemo(() => {
    if (!selected) {
      return null;
    }
    const total = selected.runbook.length;
    const done = selected.runbook.filter((step) => step.status === "done").length;
    const skipped = selected.runbook.filter((step) => step.status === "skipped").length;
    const inProgress = selected.runbook.filter((step) => step.status === "in_progress").length;
    const pending = selected.runbook.filter((step) => step.status === "pending").length;
    const completionPercent = total > 0 ? Math.round(((done + skipped) / total) * 100) : 0;
    return { total, done, skipped, inProgress, pending, completionPercent };
  }, [selected]);

  const nextRunbookAction = useMemo(() => {
    if (!selected) {
      return null;
    }
    return deriveNextRunbookAction(selected.runbook);
  }, [selected]);

  const timelineEntries = useMemo(() => {
    if (!selected) {
      return [];
    }
    if (timelineFilter === "all") {
      return selected.timeline;
    }
    return selected.timeline.filter((entry) => entry.kind === timelineFilter);
  }, [selected, timelineFilter]);

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
              {selected.id} | {selected.severity.toUpperCase()} | {selected.status.toUpperCase()}
            </p>
          </div>
          <div className="flex gap-2">
            {nextRunbookAction && selected.status === "open" && (
              <button
                onClick={() => void applyStepStatus(nextRunbookAction.step, nextRunbookAction.target)}
                disabled={!canWrite || isActing}
                className="btn-primary"
              >
                {nextRunbookAction.label}
              </button>
            )}
            {selected.status === "open" && (
              <button
                onClick={() => void resolveIncident()}
                disabled={!canWrite || !canResolve || isActing}
                className="btn"
                title={canResolve ? undefined : "Complete or skip all runbook steps first"}
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

        <section className="grid gap-3 md:grid-cols-5">
          <StatTile label="Runbook completion" value={`${runbookStats?.completionPercent ?? 0}%`} tone="accent" />
          <StatTile label="Done" value={String(runbookStats?.done ?? 0)} tone="good" />
          <StatTile label="In progress" value={String(runbookStats?.inProgress ?? 0)} tone="warn" />
          <StatTile label="Pending" value={String(runbookStats?.pending ?? 0)} tone="neutral" />
          <StatTile label="Skipped" value={String(runbookStats?.skipped ?? 0)} tone="neutral" />
        </section>

        <section className="surface p-4">
          <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wide">Affected resources</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {selected.affectedResources.map((resource) => (
              <span
                key={resource}
                className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-xs text-zinc-300"
              >
                {resource}
              </span>
            ))}
            {selected.affectedResources.length === 0 && (
              <p className="text-sm text-zinc-500">No affected resources listed.</p>
            )}
          </div>
        </section>

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
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wide">Timeline</h3>
              <div className="flex flex-wrap gap-2">
                {timelineFilters.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setTimelineFilter(item.value)}
                    className={`btn-sm ${timelineFilter === item.value ? "border-[var(--accent)] bg-[var(--accent-dim)] text-zinc-100" : ""}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 space-y-3">
              {timelineEntries.map((entry, idx) => (
                <TimelineCard key={`${entry.timestamp}-${idx}`} entry={entry} />
              ))}
              {timelineEntries.length === 0 && (
                <p className="text-sm text-zinc-500">No timeline entries for this filter.</p>
              )}
            </div>
          </article>

          <article className="surface p-4">
            <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wide">Runbook</h3>
            {runbookStats && (
              <div className="mt-3 rounded-md border border-zinc-700 bg-zinc-900/70 p-2">
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                  <span>
                    Progress: {runbookStats.done + runbookStats.skipped}/{runbookStats.total} complete
                  </span>
                  <span>{runbookStats.completionPercent}%</span>
                </div>
                <div className="mt-1.5 h-1.5 bg-zinc-700 overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)]"
                    style={{ width: `${Math.max(0, Math.min(100, runbookStats.completionPercent))}%` }}
                  />
                </div>
              </div>
            )}
            <div className="mt-3 space-y-3">
              {selected.runbook.map((step) => (
                <div
                  key={step.id}
                  className={`rounded-md border bg-zinc-900/70 p-3 ${
                    nextRunbookAction?.step.id === step.id ? "border-[var(--accent)]" : "border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-zinc-100">
                      {stepIcon(step.status)} {step.title}
                    </p>
                    <span className="text-[11px] uppercase text-zinc-500">{step.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-300">{step.description}</p>
                  {step.command && (
                    <pre className="mt-2 overflow-x-auto rounded-md border border-zinc-700 bg-zinc-950 p-2 text-xs text-zinc-200">
                      <code>{step.command}</code>
                    </pre>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {step.status === "pending" && (
                      <button
                        onClick={() => void applyStepStatus(step, "in_progress")}
                        disabled={!canWrite || isActing}
                        className="btn-sm border-zinc-600"
                      >
                        Start
                      </button>
                    )}
                    {step.status === "in_progress" && (
                      <button
                        onClick={() => void applyStepStatus(step, "done")}
                        disabled={!canWrite || isActing}
                        className="btn-sm border-zinc-600"
                      >
                        Mark Done
                      </button>
                    )}
                    {(step.status === "pending" || step.status === "in_progress") && !step.mandatory && (
                      <button
                        onClick={() => void applyStepStatus(step, "skipped")}
                        disabled={!canWrite || isActing}
                        className="btn-sm border-zinc-600"
                      >
                        Skip
                      </button>
                    )}
                  </div>
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

      <section className="grid gap-3 md:grid-cols-4">
        <StatTile label="Total incidents" value={String(incidentStats.total)} tone="neutral" />
        <StatTile label="Open" value={String(incidentStats.open)} tone="warn" />
        <StatTile label="Critical open" value={String(incidentStats.criticalOpen)} tone="bad" />
        <StatTile label="Resolved" value={String(incidentStats.resolved)} tone="good" />
      </section>

      <section className="surface p-4 grid gap-2 md:grid-cols-4">
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search id, title, summary, resource"
          className="field md:col-span-2"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          className="field"
        >
          <option value="all">All status</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
        </select>
        <select
          value={severityFilter}
          onChange={(event) => setSeverityFilter(event.target.value as typeof severityFilter)}
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
                    <button onClick={() => void loadIncidentDetail(incident.id)} className="btn-sm border-zinc-600">
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

function deriveNextRunbookAction(
  runbook: RunbookStep[],
): { step: RunbookStep; target: RunbookStepStatus; label: string } | null {
  const active = runbook.find((step) => step.status === "in_progress");
  if (active) {
    return {
      step: active,
      target: "done",
      label: `Mark "${active.title}" done`,
    };
  }
  const pending = runbook.find((step) => step.status === "pending");
  if (!pending) {
    return null;
  }
  return {
    step: pending,
    target: "in_progress",
    label: `Start "${pending.title}"`,
  };
}

function stepIcon(status: RunbookStepStatus): string {
  switch (status) {
    case "in_progress":
      return "[~]";
    case "done":
      return "[x]";
    case "skipped":
      return "[>]";
    default:
      return "[ ]";
  }
}

function TimelineCard({ entry }: { entry: TimelineEntry }) {
  return (
    <article
      className={`rounded-md border border-zinc-700 bg-zinc-900/70 p-3 border-l-4 ${timelineBorderClass(entry.kind)}`}
    >
      <p className="text-xs text-zinc-500">
        {formatTimestamp(entry.timestamp)} | {entry.source}
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

function incidentProgressLabel(runbook: RunbookStep[]): string {
  if (runbook.length === 0) {
    return "0%";
  }
  const complete = runbook.filter((step) => step.status === "done" || step.status === "skipped").length;
  return `${Math.round((complete / runbook.length) * 100)}%`;
}

const timelineFilters: Array<{ value: TimelineFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "diagnostic", label: "Diagnostic" },
  { value: "event", label: "Events" },
  { value: "prediction", label: "Prediction" },
  { value: "action", label: "Actions" },
];

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "accent" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "accent"
      ? "text-[var(--accent)]"
      : tone === "good"
        ? "text-[var(--green)]"
        : tone === "warn"
          ? "text-[var(--amber)]"
          : tone === "bad"
            ? "text-[var(--red)]"
            : "text-zinc-100";
  return (
    <div className="surface p-3">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
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
