import type { PodCreateRequest } from "../../../types";

/**
 * Create pod form panel.
 */
interface PodCreateFormProps {
  createForm: PodCreateRequest;
  isBusy: boolean;
  onFieldChange: (field: keyof PodCreateRequest, value: string) => void;
  onSubmit: () => void;
}

export function PodCreateForm({ createForm, isBusy, onFieldChange, onSubmit }: PodCreateFormProps) {
  return (
    <div className="surface p-4">
      <p className="text-sm font-semibold text-zinc-100">Create Pod</p>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="text-xs text-zinc-400">
          Namespace
          <input
            value={createForm.namespace}
            onChange={(event) => onFieldChange("namespace", event.target.value)}
            className="field mt-1 w-full"
          />
        </label>
        <label className="text-xs text-zinc-400">
          Pod Name
          <input
            value={createForm.name}
            onChange={(event) => onFieldChange("name", event.target.value)}
            className="field mt-1 w-full"
          />
        </label>
        <label className="text-xs text-zinc-400">
          Image
          <input
            value={createForm.image}
            onChange={(event) => onFieldChange("image", event.target.value)}
            className="field mt-1 w-full"
          />
        </label>
      </div>
      <div className="mt-3">
        <button onClick={onSubmit} disabled={isBusy} className="btn-solid">
          {isBusy ? "Processing" : "Create"}
        </button>
      </div>
    </div>
  );
}
