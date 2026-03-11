import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthSession } from "../../context/AuthSessionContext";
import { api } from "../../lib/api";
import type { RemediationProposal } from "../../types";

type StatusFilter = "all" | "proposed" | "approved" | "executed" | "rejected";
type RiskFilter = "all" | "high" | "medium" | "low";

export default function RemediationView() {
  const { can } = useAuthSession();
  const canRead = can("read");
  const canWrite = can("write");

  const [items, setItems] = useState<RemediationProposal[]>([]);
  const [selectedID, setSelectedID] = useState<string | null>(null);
  const [rejectingID, setRejectingID] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [executing, setExecuting] = useState<RemediationProposal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const chooseDefaultSelection = useCallback((rows: RemediationProposal[]) => {
    if (rows.length === 0) {
      setSelectedID(null);
      return;
    }
    const next = [...rows].sort(compareProposalPriority)[0];
    setSelectedID(next.id);
  }, []);

  const refresh = useCallback(async () => {
    if (!canRead) {
      setItems([]);
      setError("Authenticate to view remediation proposals.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await api.listRemediation();
      setItems(data);
      setSelectedID((current) =>
        current && data.some((item) => item.id === current) ? current : (data[0]?.id ?? null),
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load remediation proposals");
    } finally {
      setIsLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const approveID = params.get("approve");
    if (approveID && approveID.trim() !== "") {
      setSelectedID(approveID.trim());
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sortedItems = useMemo(() => [...items].sort(compareProposalPriority), [items]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return sortedItems.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }
      if (riskFilter !== "all" && normalizeRisk(item.riskLevel) !== riskFilter) {
        return false;
      }
      if (query === "") {
        return true;
      }
      return `${item.id} ${item.kind} ${item.resource} ${item.namespace} ${item.reason} ${item.status}`
        .toLowerCase()
        .includes(query);
    });
  }, [riskFilter, searchQuery, sortedItems, statusFilter]);

  const selectedProposal = useMemo(() => {
    if (!selectedID) {
      return null;
    }
    return items.find((item) => item.id === selectedID) ?? null;
  }, [items, selectedID]);

  const queueHead = useMemo(() => {
    return sortedItems.find((item) => item.status === "proposed" || item.status === "approved") ?? null;
  }, [sortedItems]);

  const stats = useMemo(() => {
    const proposed = items.filter((item) => item.status === "proposed").length;
    const approved = items.filter((item) => item.status === "approved").length;
    const executed = items.filter((item) => item.status === "executed").length;
    const rejected = items.filter((item) => item.status === "rejected").length;
    const highRiskOpen = items.filter(
      (item) => normalizeRisk(item.riskLevel) === "high" && (item.status === "proposed" || item.status === "approved"),
    ).length;
    return { total: items.length, proposed, approved, executed, rejected, highRiskOpen };
  }, [items]);

  const propose = useCallback(async () => {
    setIsActing(true);
    try {
      const proposals = await api.proposeRemediation();
      setItems(proposals);
      chooseDefaultSelection(proposals);
      setMessage(`Generated ${proposals.length} remediation proposal(s).`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate proposals");
    } finally {
      setIsActing(false);
    }
  }, [chooseDefaultSelection]);

  const approve = useCallback(
    async (id: string) => {
      if (!canWrite) {
        return null;
      }
      setIsActing(true);
      try {
        const updated = await api.approveRemediation(id);
        setItems((current) => current.map((item) => (item.id === id ? updated : item)));
        setMessage(`Proposal ${id} approved.`);
        setError(null);
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve proposal");
        return null;
      } finally {
        setIsActing(false);
      }
    },
    [canWrite],
  );

  const approveAndPrepareExecute = useCallback(
    async (proposal: RemediationProposal) => {
      const updated = await approve(proposal.id);
      if (!updated) {
        return;
      }
      setExecuting(updated);
      setMessage(`Proposal ${proposal.id} approved. Confirm execution next.`);
    },
    [approve],
  );

  const execute = useCallback(
    async (proposal: RemediationProposal) => {
      if (!canWrite) {
        return;
      }
      setIsActing(true);
      try {
        const updated = await api.executeRemediation(proposal.id);
        setItems((current) => current.map((item) => (item.id === proposal.id ? updated : item)));
        setExecuting(null);
        setMessage(`Proposal ${proposal.id} executed.`);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to execute proposal");
      } finally {
        setIsActing(false);
      }
    },
    [canWrite],
  );

  const reject = useCallback(
    async (id: string, reason: string) => {
      if (!canRead) {
        return;
      }
      setIsActing(true);
      try {
        const updated = await api.rejectRemediation(id, { reason });
        setItems((current) => current.map((item) => (item.id === id ? updated : item)));
        setRejectingID(null);
        setRejectReason("");
        setMessage(`Proposal ${id} rejected.`);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reject proposal");
      } finally {
        setIsActing(false);
      }
    },
    [canRead],
  );

  return (
    <div className="space-y-4">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Safe Auto-Remediation</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Review ranked proposals, approve with RBAC, and execute with explicit safety confirmation.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void refresh()} disabled={isLoading || isActing} className="btn">
            {isLoading ? "Loading" : "Refresh"}
          </button>
          <button onClick={() => void propose()} disabled={!canRead || isActing} className="btn-primary">
            Generate Proposals
          </button>
        </div>
      </header>

      {message && <Banner tone="ok" text={message} />}
      {error && <Banner tone="err" text={error} />}

      {selectedProposal && (
        <div className="rounded-md border border-[#3b82f6]/40 bg-[#3b82f6]/12 px-3 py-2 text-sm text-zinc-100">
          Deep-link selected proposal: <span className="font-semibold">{selectedProposal.id}</span>
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-6">
        <StatTile label="Total" value={String(stats.total)} tone="neutral" />
        <StatTile label="Proposed" value={String(stats.proposed)} tone="warn" />
        <StatTile label="Approved" value={String(stats.approved)} tone="accent" />
        <StatTile label="Executed" value={String(stats.executed)} tone="good" />
        <StatTile label="Rejected" value={String(stats.rejected)} tone="neutral" />
        <StatTile label="High risk open" value={String(stats.highRiskOpen)} tone="bad" />
      </section>

      <section className="surface p-4 grid gap-2 md:grid-cols-4">
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search id, kind, reason, resource"
          className="field md:col-span-2"
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
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
          onChange={(event) => setRiskFilter(event.target.value as RiskFilter)}
          className="field"
        >
          <option value="all">All risk</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </section>

      {queueHead && (
        <section className="surface p-3">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Operator guidance</p>
          <p className="mt-1 text-sm text-zinc-200">
            {queueHead.status === "proposed"
              ? `Top priority: review and approve ${queueHead.id} (${displayResource(queueHead)}).`
              : `Top priority: validate and execute ${queueHead.id} (${displayResource(queueHead)}).`}
          </p>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredItems.map((proposal) => {
          const canReject = proposal.status === "proposed" || proposal.status === "approved";
          const risk = normalizeRisk(proposal.riskLevel);
          return (
            <article
              key={proposal.id}
              className={`surface p-4 ${selectedID === proposal.id ? "border-[#3b82f6]/60" : ""}`}
              onClick={() => setSelectedID(proposal.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full border border-zinc-600 px-2 py-0.5 text-[11px] uppercase text-zinc-200">
                  {proposal.kind.replaceAll("_", " ")}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] uppercase ${riskClass(proposal.riskLevel)}`}
                >
                  {proposal.riskLevel}
                </span>
              </div>

              <p className="mt-2 text-sm font-semibold text-zinc-100">{displayResource(proposal)}</p>
              <p className="mt-1 text-sm text-zinc-300">{proposal.reason}</p>
              <p className="mt-2 text-xs uppercase text-zinc-500">Status: {proposal.status}</p>
              <p className="text-[11px] text-zinc-500 mt-1">Updated: {formatTimestamp(proposal.updatedAt)}</p>

              <details className="mt-3 rounded-md border border-zinc-700 bg-zinc-900/70 p-2">
                <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-500">
                  Dry-run result
                </summary>
                <p className="mt-2 text-sm text-zinc-300">{proposal.dryRunResult}</p>
              </details>

              {proposal.executionResult && (
                <p className="mt-2 rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-xs text-zinc-300">
                  Executed: {proposal.executionResult}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    void approve(proposal.id);
                  }}
                  disabled={!canWrite || isActing || proposal.status !== "proposed"}
                  className="btn-sm border-zinc-600"
                >
                  Approve
                </button>

                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setRejectingID(proposal.id);
                    setRejectReason("");
                  }}
                  disabled={!canRead || isActing || !canReject}
                  className="btn-sm border-zinc-600"
                >
                  Reject
                </button>

                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    setExecuting(proposal);
                  }}
                  disabled={!canWrite || isActing || proposal.status !== "approved"}
                  className="btn-sm border-zinc-600"
                >
                  Execute
                </button>

                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    void approveAndPrepareExecute(proposal);
                  }}
                  disabled={!canWrite || isActing || proposal.status !== "proposed" || risk !== "low"}
                  className="btn-sm border-zinc-600"
                  title={risk === "low" ? "Fast path for low-risk proposals" : "Only available for low-risk proposals"}
                >
                  Approve and Queue Execute
                </button>
              </div>
            </article>
          );
        })}

        {!isLoading && filteredItems.length === 0 && (
          <article className="surface p-4 md:col-span-2 xl:col-span-3">
            <p className="text-sm text-zinc-500">No remediation proposals match your current filters.</p>
          </article>
        )}
      </section>

      {rejectingID && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg app-shell p-4">
            <p className="text-sm font-semibold text-zinc-100">Reject Proposal {rejectingID}</p>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              className="field mt-3 w-full min-h-28"
              placeholder="Reason for rejection"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setRejectingID(null)} className="btn">
                Cancel
              </button>
              <button
                onClick={() => void reject(rejectingID, rejectReason)}
                disabled={isActing || rejectReason.trim() === ""}
                className="btn-primary"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {executing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl app-shell p-4">
            <p className="text-sm font-semibold text-zinc-100">Execute Proposal {executing.id}?</p>
            <p className="mt-2 text-sm text-zinc-300">Review dry-run output before execution:</p>
            <pre className="mt-2 overflow-x-auto rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-200 whitespace-pre-wrap">
              {executing.dryRunResult}
            </pre>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setExecuting(null)} className="btn">
                Cancel
              </button>
              <button onClick={() => void execute(executing)} disabled={isActing || !canWrite} className="btn-primary">
                Confirm Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function compareProposalPriority(a: RemediationProposal, b: RemediationProposal): number {
  const scoreDelta = proposalPriorityScore(b) - proposalPriorityScore(a);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  return parseDate(b.updatedAt) - parseDate(a.updatedAt);
}

function proposalPriorityScore(proposal: RemediationProposal): number {
  const statusWeight =
    proposal.status === "proposed" ? 40 : proposal.status === "approved" ? 30 : proposal.status === "executed" ? 10 : 0;
  const riskWeight =
    normalizeRisk(proposal.riskLevel) === "high"
      ? 9
      : normalizeRisk(proposal.riskLevel) === "medium"
        ? 6
        : normalizeRisk(proposal.riskLevel) === "low"
          ? 3
          : 1;
  return statusWeight + riskWeight;
}

function parseDate(value: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

function normalizeRisk(level: string): RiskFilter {
  const normalized = level.trim().toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "all";
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function riskClass(level: string): string {
  const normalized = level.trim().toLowerCase();
  if (normalized === "high") {
    return "border-[var(--red)]/40 bg-[var(--red)]/12 text-zinc-100";
  }
  if (normalized === "medium") {
    return "border-[var(--amber)]/40 bg-[var(--amber)]/12 text-zinc-100";
  }
  return "border-[#34c759]/40 bg-[#34c759]/12 text-zinc-100";
}

function displayResource(proposal: RemediationProposal): string {
  if (proposal.namespace.trim() === "") {
    return proposal.resource;
  }
  return `${proposal.namespace}/${proposal.resource}`;
}

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
