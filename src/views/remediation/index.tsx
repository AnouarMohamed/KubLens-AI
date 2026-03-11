import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthSession } from "../../context/AuthSessionContext";
import { api } from "../../lib/api";
import type { RemediationProposal } from "../../types";

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

  const selectedProposal = useMemo(() => {
    if (!selectedID) {
      return null;
    }
    return items.find((item) => item.id === selectedID) ?? null;
  }, [items, selectedID]);

  const propose = useCallback(async () => {
    setIsActing(true);
    try {
      const proposals = await api.proposeRemediation();
      setItems(proposals);
      if (proposals.length > 0) {
        setSelectedID(proposals[0].id);
      }
      setMessage(`Generated ${proposals.length} remediation proposal(s).`);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate proposals");
    } finally {
      setIsActing(false);
    }
  }, []);

  const approve = useCallback(
    async (id: string) => {
      if (!canWrite) {
        return;
      }
      setIsActing(true);
      try {
        const updated = await api.approveRemediation(id);
        setItems((current) => current.map((item) => (item.id === id ? updated : item)));
        setMessage(`Proposal ${id} approved.`);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve proposal");
      } finally {
        setIsActing(false);
      }
    },
    [canWrite],
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
            Generate dry-run proposals, approve with RBAC, and execute with confirmation.
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

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((proposal) => (
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

            <details className="mt-3 rounded-md border border-zinc-700 bg-zinc-900/70 p-2">
              <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-500">Dry-run result</summary>
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
                disabled={!canRead || isActing || (proposal.status !== "proposed" && proposal.status !== "approved")}
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
            </div>
          </article>
        ))}

        {!isLoading && items.length === 0 && (
          <article className="surface p-4 md:col-span-2 xl:col-span-3">
            <p className="text-sm text-zinc-500">No remediation proposals yet.</p>
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
