import type { ResourceRecord, View } from "../../../types";

interface ResourceYAMLEditorModalProps {
  view: View;
  yamlTarget: ResourceRecord | null;
  yamlText: string;
  isActing: boolean;
  canWrite: boolean;
  onClose: () => void;
  onYAMLChange: (value: string) => void;
  onApply: () => void;
}

export function ResourceYAMLEditorModal({
  view,
  yamlTarget,
  yamlText,
  isActing,
  canWrite,
  onClose,
  onYAMLChange,
  onApply,
}: ResourceYAMLEditorModalProps) {
  if (!yamlTarget) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-5xl app-shell">
        <header className="border-b border-zinc-700 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Edit YAML</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {view}: {yamlTarget.namespace}/{yamlTarget.name}
            </p>
          </div>
          <button onClick={onClose} className="btn-sm border-zinc-600">
            Close
          </button>
        </header>
        <div className="p-4">
          <textarea
            value={yamlText}
            onChange={(event) => onYAMLChange(event.target.value)}
            className="h-[60vh] w-full rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs font-mono text-zinc-100"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={onClose} className="btn-sm border-zinc-600">
              Cancel
            </button>
            <button onClick={onApply} disabled={isActing || !canWrite} className="btn-primary h-auto py-1.5 text-xs">
              {isActing ? "Applying" : "Apply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ResourceScaleModalProps {
  view: View;
  scaleTarget: ResourceRecord | null;
  scaleReplicas: string;
  isActing: boolean;
  canWrite: boolean;
  onClose: () => void;
  onReplicasChange: (value: string) => void;
  onScale: () => void;
}

export function ResourceScaleModal({
  view,
  scaleTarget,
  scaleReplicas,
  isActing,
  canWrite,
  onClose,
  onReplicasChange,
  onScale,
}: ResourceScaleModalProps) {
  if (!scaleTarget) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md app-shell">
        <header className="border-b border-zinc-700 px-4 py-3">
          <p className="text-sm font-semibold text-zinc-100">Scale Resource</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            {view}: {scaleTarget.namespace}/{scaleTarget.name}
          </p>
        </header>
        <div className="p-4 space-y-3">
          <label className="text-xs text-zinc-400">
            Replicas
            <input
              value={scaleReplicas}
              onChange={(event) => onReplicasChange(event.target.value)}
              type="number"
              min={0}
              className="field mt-1 w-full"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="btn-sm border-zinc-600">
              Cancel
            </button>
            <button onClick={onScale} disabled={isActing || !canWrite} className="btn-primary h-auto py-1.5 text-xs">
              {isActing ? "Scaling" : "Scale"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
