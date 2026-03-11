import type { ResourceRecord } from "../../../types";
import type { DeploymentDetail } from "../types";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200">
      <span className="text-zinc-500">{label}:</span> {value}
    </p>
  );
}

interface DeploymentDetailModalProps {
  detail: DeploymentDetail | null;
  onClose: () => void;
}

export function DeploymentDetailModal({ detail, onClose }: DeploymentDetailModalProps) {
  if (!detail) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-6xl app-shell">
        <header className="border-b border-zinc-700 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Deployment Detail</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {detail.target.namespace}/{detail.target.name}
            </p>
          </div>
          <button onClick={onClose} className="btn-sm border-zinc-600">
            Close
          </button>
        </header>
        <div className="p-4 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
          <div className="space-y-2">
            <InfoRow label="Rollout" value={detail.target.status} />
            <InfoRow label="Age" value={detail.target.age} />
            <InfoRow label="Summary" value={detail.target.summary || "n/a"} />
          </div>
          <pre className="max-h-[65vh] overflow-auto rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-200">
            {detail.yaml}
          </pre>
        </div>
      </div>
    </div>
  );
}

interface DeploymentYAMLEditorModalProps {
  yamlEditor: DeploymentDetail | null;
  canWrite: boolean;
  isActing: boolean;
  onClose: () => void;
  onYAMLChange: (yaml: string) => void;
  onApply: () => void;
}

export function DeploymentYAMLEditorModal({
  yamlEditor,
  canWrite,
  isActing,
  onClose,
  onYAMLChange,
  onApply,
}: DeploymentYAMLEditorModalProps) {
  if (!yamlEditor) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-6xl app-shell">
        <header className="border-b border-zinc-700 px-4 py-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-zinc-100">
            Edit YAML: {yamlEditor.target.namespace}/{yamlEditor.target.name}
          </p>
          <button onClick={onClose} className="btn-sm border-zinc-600">
            Close
          </button>
        </header>
        <div className="p-4">
          <textarea
            value={yamlEditor.yaml}
            onChange={(event) => onYAMLChange(event.target.value)}
            className="h-[60vh] w-full rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs font-mono text-zinc-100"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={onClose} className="btn-sm border-zinc-600">
              Cancel
            </button>
            <button onClick={onApply} disabled={!canWrite || isActing} className="btn-primary h-auto py-1.5 text-xs">
              {isActing ? "Applying" : "Apply"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface DeploymentScaleModalProps {
  scaleTarget: ResourceRecord | null;
  scaleReplicas: string;
  canWrite: boolean;
  isActing: boolean;
  onClose: () => void;
  onReplicasChange: (value: string) => void;
  onScale: () => void;
}

export function DeploymentScaleModal({
  scaleTarget,
  scaleReplicas,
  canWrite,
  isActing,
  onClose,
  onReplicasChange,
  onScale,
}: DeploymentScaleModalProps) {
  if (!scaleTarget) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md app-shell">
        <header className="border-b border-zinc-700 px-4 py-3">
          <p className="text-sm font-semibold text-zinc-100">Scale Deployment</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            {scaleTarget.namespace}/{scaleTarget.name}
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
            <button onClick={onScale} disabled={!canWrite || isActing} className="btn-primary h-auto py-1.5 text-xs">
              {isActing ? "Scaling" : "Scale"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
