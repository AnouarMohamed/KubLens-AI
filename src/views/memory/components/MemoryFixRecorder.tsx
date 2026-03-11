import type { MemoryFixCreateRequest } from "../../../types";

interface MemoryFixRecorderProps {
  fixForm: MemoryFixCreateRequest;
  canWrite: boolean;
  isActing: boolean;
  onChange: (patch: Partial<MemoryFixCreateRequest>) => void;
  onSave: () => void;
}

export function MemoryFixRecorder({ fixForm, canWrite, isActing, onChange, onSave }: MemoryFixRecorderProps) {
  return (
    <article className="surface space-y-3 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-100">Record Fix Pattern</h3>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-xs text-zinc-400">
          Incident ID
          <input
            value={fixForm.incidentId}
            onChange={(event) => onChange({ incidentId: event.target.value })}
            className="field mt-1 w-full"
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Proposal ID
          <input
            value={fixForm.proposalId}
            onChange={(event) => onChange({ proposalId: event.target.value })}
            className="field mt-1 w-full"
          />
        </label>
      </div>
      <label className="block text-xs text-zinc-400">
        Title
        <input
          value={fixForm.title}
          onChange={(event) => onChange({ title: event.target.value })}
          className="field mt-1 w-full"
        />
      </label>
      <label className="block text-xs text-zinc-400">
        Resource
        <input
          value={fixForm.resource}
          onChange={(event) => onChange({ resource: event.target.value })}
          className="field mt-1 w-full"
        />
      </label>
      <label className="block text-xs text-zinc-400">
        Kind
        <select
          value={fixForm.kind}
          onChange={(event) =>
            onChange({
              kind: event.target.value as MemoryFixCreateRequest["kind"],
            })
          }
          className="field mt-1 w-full"
        >
          <option value="restart_pod">restart_pod</option>
          <option value="cordon_node">cordon_node</option>
          <option value="rollback_deployment">rollback_deployment</option>
        </select>
      </label>
      <label className="block text-xs text-zinc-400">
        Description
        <textarea
          value={fixForm.description}
          onChange={(event) => onChange({ description: event.target.value })}
          className="field mt-1 min-h-24 w-full"
        />
      </label>
      <button onClick={onSave} disabled={!canWrite || isActing} className="btn-primary">
        Record Fix
      </button>
    </article>
  );
}
