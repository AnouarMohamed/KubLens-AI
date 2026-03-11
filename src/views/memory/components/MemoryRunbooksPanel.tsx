import type { MemoryRunbook } from "../../../types";
import { formatTimestamp } from "../utils";

interface MemoryRunbooksPanelProps {
  runbooks: MemoryRunbook[];
  isLoading: boolean;
  canWrite: boolean;
  onEdit: (runbook: MemoryRunbook) => void;
}

export function MemoryRunbooksPanel({ runbooks, isLoading, canWrite, onEdit }: MemoryRunbooksPanelProps) {
  return (
    <article className="surface p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-100">Runbooks</h3>
      <div className="mt-3 space-y-3">
        {runbooks.map((runbook) => (
          <div key={runbook.id} className="rounded-md border border-zinc-700 bg-zinc-900/70 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-100">{runbook.title}</p>
              <button onClick={() => onEdit(runbook)} disabled={!canWrite} className="btn-sm border-zinc-600">
                Edit
              </button>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Usage {runbook.usageCount} - Updated {formatTimestamp(runbook.updatedAt)}
            </p>
            <p className="mt-2 text-sm text-zinc-300">{runbook.description}</p>
            <p className="mt-2 text-xs text-zinc-400">Tags: {runbook.tags.join(", ") || "none"}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-zinc-300">
              {runbook.steps.map((step, index) => (
                <li key={`${runbook.id}-${index}`}>{step}</li>
              ))}
            </ol>
          </div>
        ))}
        {!isLoading && runbooks.length === 0 && <p className="text-sm text-zinc-500">No runbooks found.</p>}
      </div>
    </article>
  );
}
