import { useCallback, useEffect, useState } from "react";
import { useAuthSession } from "../../context/AuthSessionContext";
import { api } from "../../lib/api";
import type { MemoryFixCreateRequest, MemoryFixPattern, MemoryRunbook, MemoryRunbookUpsertRequest } from "../../types";

const EMPTY_RUNBOOK: MemoryRunbookUpsertRequest = {
  title: "",
  tags: [],
  description: "",
  steps: [],
};

const EMPTY_FIX: MemoryFixCreateRequest = {
  incidentId: "",
  proposalId: "",
  title: "",
  description: "",
  resource: "",
  kind: "restart_pod",
};

export default function MemoryView() {
  const { can } = useAuthSession();
  const canRead = can("read");
  const canWrite = can("write");

  const [query, setQuery] = useState("");
  const [runbooks, setRunbooks] = useState<MemoryRunbook[]>([]);
  const [fixes, setFixes] = useState<MemoryFixPattern[]>([]);
  const [editingID, setEditingID] = useState<string | null>(null);
  const [runbookForm, setRunbookForm] = useState<MemoryRunbookUpsertRequest>(EMPTY_RUNBOOK);
  const [fixForm, setFixForm] = useState<MemoryFixCreateRequest>(EMPTY_FIX);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refreshRunbooks = useCallback(
    async (q = query) => {
      if (!canRead) {
        setRunbooks([]);
        setError("Authenticate to view memory runbooks.");
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const data = await api.searchMemoryRunbooks(q);
        setRunbooks(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load runbooks");
      } finally {
        setIsLoading(false);
      }
    },
    [canRead, query],
  );

  const refreshFixes = useCallback(
    async (q = query) => {
      if (!canRead) {
        setFixes([]);
        return;
      }
      try {
        const data = await api.listMemoryFixes(q);
        setFixes(data);
      } catch {
        setFixes([]);
      }
    },
    [canRead, query],
  );

  useEffect(() => {
    void refreshRunbooks("");
    void refreshFixes("");
  }, [refreshFixes, refreshRunbooks]);

  const saveRunbook = useCallback(async () => {
    if (!canWrite) {
      return;
    }
    setIsActing(true);
    try {
      const payload: MemoryRunbookUpsertRequest = {
        title: runbookForm.title.trim(),
        description: runbookForm.description.trim(),
        tags: parseList(runbookForm.tags.join(", ")),
        steps: parseMultiline(runbookForm.steps.join("\n")),
      };
      if (editingID) {
        await api.updateMemoryRunbook(editingID, payload);
        setMessage(`Runbook ${editingID} updated.`);
      } else {
        const created = await api.createMemoryRunbook(payload);
        setMessage(`Runbook ${created.id} created.`);
      }
      setRunbookForm(EMPTY_RUNBOOK);
      setEditingID(null);
      await refreshRunbooks(query);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save runbook");
    } finally {
      setIsActing(false);
    }
  }, [canWrite, editingID, query, refreshRunbooks, runbookForm]);

  const saveFix = useCallback(async () => {
    if (!canWrite) {
      return;
    }
    setIsActing(true);
    try {
      const payload: MemoryFixCreateRequest = {
        incidentId: fixForm.incidentId.trim(),
        proposalId: fixForm.proposalId.trim(),
        title: fixForm.title.trim(),
        description: fixForm.description.trim(),
        resource: fixForm.resource.trim(),
        kind: fixForm.kind,
      };
      const created = await api.recordMemoryFix(payload);
      setMessage(`Fix pattern ${created.id} recorded.`);
      setFixForm(EMPTY_FIX);
      await refreshFixes();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record fix");
    } finally {
      setIsActing(false);
    }
  }, [canWrite, fixForm, refreshFixes]);

  return (
    <div className="space-y-4">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Cluster Memory</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Search team runbooks and store durable fix patterns from resolved incidents.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, tags, description"
            className="field w-80"
          />
          <button onClick={() => void refreshRunbooks(query)} disabled={isLoading || isActing} className="btn">
            {isLoading ? "Loading" : "Search"}
          </button>
          <button onClick={() => void refreshFixes(query)} disabled={isActing} className="btn">
            Search Fixes
          </button>
        </div>
      </header>

      {message && <Banner tone="ok" text={message} />}
      {error && <Banner tone="err" text={error} />}

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="surface p-4">
          <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wide">Runbooks</h3>
          <div className="mt-3 space-y-3">
            {runbooks.map((runbook) => (
              <div key={runbook.id} className="rounded-md border border-zinc-700 bg-zinc-900/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-zinc-100">{runbook.title}</p>
                  <button
                    onClick={() => {
                      setEditingID(runbook.id);
                      setRunbookForm({
                        title: runbook.title,
                        tags: runbook.tags,
                        description: runbook.description,
                        steps: runbook.steps,
                      });
                    }}
                    disabled={!canWrite}
                    className="btn-sm border-zinc-600"
                  >
                    Edit
                  </button>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Usage {runbook.usageCount} • Updated {formatTimestamp(runbook.updatedAt)}
                </p>
                <p className="mt-2 text-sm text-zinc-300">{runbook.description}</p>
                <p className="mt-2 text-xs text-zinc-400">Tags: {runbook.tags.join(", ") || "none"}</p>
                <ol className="mt-2 list-decimal pl-5 text-sm text-zinc-300 space-y-1">
                  {runbook.steps.map((step, index) => (
                    <li key={`${runbook.id}-${index}`}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
            {!isLoading && runbooks.length === 0 && <p className="text-sm text-zinc-500">No runbooks found.</p>}
          </div>
        </article>

        <article className="surface p-4 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wide">
            {editingID ? `Edit Runbook ${editingID}` : "Create Runbook"}
          </h3>
          <label className="text-xs text-zinc-400 block">
            Title
            <input
              value={runbookForm.title}
              onChange={(event) => setRunbookForm((current) => ({ ...current, title: event.target.value }))}
              className="field mt-1 w-full"
            />
          </label>
          <label className="text-xs text-zinc-400 block">
            Tags (comma separated)
            <input
              value={runbookForm.tags.join(", ")}
              onChange={(event) => setRunbookForm((current) => ({ ...current, tags: parseList(event.target.value) }))}
              className="field mt-1 w-full"
            />
          </label>
          <label className="text-xs text-zinc-400 block">
            Description
            <textarea
              value={runbookForm.description}
              onChange={(event) => setRunbookForm((current) => ({ ...current, description: event.target.value }))}
              className="field mt-1 w-full min-h-24"
            />
          </label>
          <label className="text-xs text-zinc-400 block">
            Steps (one per line)
            <textarea
              value={runbookForm.steps.join("\n")}
              onChange={(event) =>
                setRunbookForm((current) => ({ ...current, steps: parseMultiline(event.target.value) }))
              }
              className="field mt-1 w-full min-h-32"
            />
          </label>
          <div className="flex gap-2">
            <button onClick={() => void saveRunbook()} disabled={!canWrite || isActing} className="btn-primary">
              {editingID ? "Update Runbook" : "Create Runbook"}
            </button>
            <button
              onClick={() => {
                setEditingID(null);
                setRunbookForm(EMPTY_RUNBOOK);
              }}
              className="btn"
            >
              Reset
            </button>
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="surface p-4 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wide">Record Fix Pattern</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-zinc-400 block">
              Incident ID
              <input
                value={fixForm.incidentId}
                onChange={(event) => setFixForm((current) => ({ ...current, incidentId: event.target.value }))}
                className="field mt-1 w-full"
              />
            </label>
            <label className="text-xs text-zinc-400 block">
              Proposal ID
              <input
                value={fixForm.proposalId}
                onChange={(event) => setFixForm((current) => ({ ...current, proposalId: event.target.value }))}
                className="field mt-1 w-full"
              />
            </label>
          </div>
          <label className="text-xs text-zinc-400 block">
            Title
            <input
              value={fixForm.title}
              onChange={(event) => setFixForm((current) => ({ ...current, title: event.target.value }))}
              className="field mt-1 w-full"
            />
          </label>
          <label className="text-xs text-zinc-400 block">
            Resource
            <input
              value={fixForm.resource}
              onChange={(event) => setFixForm((current) => ({ ...current, resource: event.target.value }))}
              className="field mt-1 w-full"
            />
          </label>
          <label className="text-xs text-zinc-400 block">
            Kind
            <select
              value={fixForm.kind}
              onChange={(event) =>
                setFixForm((current) => ({
                  ...current,
                  kind: event.target.value as MemoryFixCreateRequest["kind"],
                }))
              }
              className="field mt-1 w-full"
            >
              <option value="restart_pod">restart_pod</option>
              <option value="cordon_node">cordon_node</option>
              <option value="rollback_deployment">rollback_deployment</option>
            </select>
          </label>
          <label className="text-xs text-zinc-400 block">
            Description
            <textarea
              value={fixForm.description}
              onChange={(event) => setFixForm((current) => ({ ...current, description: event.target.value }))}
              className="field mt-1 w-full min-h-24"
            />
          </label>
          <button onClick={() => void saveFix()} disabled={!canWrite || isActing} className="btn-primary">
            Record Fix
          </button>
        </article>

        <article className="surface p-4">
          <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wide">Fix Patterns</h3>
          <div className="mt-3 space-y-3">
            {fixes.map((fix) => (
              <div key={fix.id} className="rounded-md border border-zinc-700 bg-zinc-900/70 p-3">
                <p className="text-sm font-semibold text-zinc-100">{fix.title}</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {fix.id} • {fix.recordedBy} • {formatTimestamp(fix.recordedAt)}
                </p>
                <p className="mt-2 text-sm text-zinc-300">{fix.description}</p>
                <p className="mt-1 text-xs text-zinc-400">
                  {fix.kind} • {fix.resource}
                </p>
              </div>
            ))}
            {fixes.length === 0 && <p className="text-sm text-zinc-500">No fix patterns recorded yet.</p>}
          </div>
        </article>
      </section>
    </div>
  );
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function parseMultiline(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
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
