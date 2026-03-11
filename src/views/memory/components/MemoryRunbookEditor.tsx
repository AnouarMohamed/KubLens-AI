import type { MemoryRunbookUpsertRequest } from "../../../types";
import { parseList, parseMultiline } from "../utils";

interface MemoryRunbookEditorProps {
  editingID: string | null;
  runbookForm: MemoryRunbookUpsertRequest;
  canWrite: boolean;
  isActing: boolean;
  onChange: (patch: Partial<MemoryRunbookUpsertRequest>) => void;
  onSave: () => void;
  onReset: () => void;
}

export function MemoryRunbookEditor({
  editingID,
  runbookForm,
  canWrite,
  isActing,
  onChange,
  onSave,
  onReset,
}: MemoryRunbookEditorProps) {
  return (
    <article className="surface space-y-4 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-100">
        {editingID ? `Edit Runbook ${editingID}` : "Create Runbook"}
      </h3>
      <label className="block text-xs text-zinc-400">
        Title
        <input
          value={runbookForm.title}
          onChange={(event) => onChange({ title: event.target.value })}
          className="field mt-1 w-full"
        />
      </label>
      <label className="block text-xs text-zinc-400">
        Tags (comma separated)
        <input
          value={runbookForm.tags.join(", ")}
          onChange={(event) => onChange({ tags: parseList(event.target.value) })}
          className="field mt-1 w-full"
        />
      </label>
      <label className="block text-xs text-zinc-400">
        Description
        <textarea
          value={runbookForm.description}
          onChange={(event) => onChange({ description: event.target.value })}
          className="field mt-1 min-h-24 w-full"
        />
      </label>
      <label className="block text-xs text-zinc-400">
        Steps (one per line)
        <textarea
          value={runbookForm.steps.join("\n")}
          onChange={(event) => onChange({ steps: parseMultiline(event.target.value) })}
          className="field mt-1 min-h-32 w-full"
        />
      </label>
      <div className="flex gap-2">
        <button onClick={onSave} disabled={!canWrite || isActing} className="btn-primary">
          {editingID ? "Update Runbook" : "Create Runbook"}
        </button>
        <button onClick={onReset} className="btn">
          Reset
        </button>
      </div>
    </article>
  );
}
