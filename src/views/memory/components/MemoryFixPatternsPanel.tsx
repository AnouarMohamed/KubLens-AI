import type { MemoryFixPattern } from "../../../types";
import { formatTimestamp } from "../utils";

interface MemoryFixPatternsPanelProps {
  fixes: MemoryFixPattern[];
}

export function MemoryFixPatternsPanel({ fixes }: MemoryFixPatternsPanelProps) {
  return (
    <article className="surface p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-100">Fix Patterns</h3>
      <div className="mt-3 space-y-3">
        {fixes.map((fix) => (
          <div key={fix.id} className="rounded-md border border-zinc-700 bg-zinc-900/70 p-3">
            <p className="text-sm font-semibold text-zinc-100">{fix.title}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {fix.id} - {fix.recordedBy} - {formatTimestamp(fix.recordedAt)}
            </p>
            <p className="mt-2 text-sm text-zinc-300">{fix.description}</p>
            <p className="mt-1 text-xs text-zinc-400">
              {fix.kind} - {fix.resource}
            </p>
          </div>
        ))}
        {fixes.length === 0 && <p className="text-sm text-zinc-500">No fix patterns recorded yet.</p>}
      </div>
    </article>
  );
}
