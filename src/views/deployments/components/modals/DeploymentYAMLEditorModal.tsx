import type { DeploymentDetail } from "../../types";
import { DeploymentModalHeader, DeploymentModalShell } from "./DeploymentModalPrimitives";

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
    <DeploymentModalShell
      maxWidthClass="max-w-6xl"
      header={
        <DeploymentModalHeader
          title={`Edit YAML: ${yamlEditor.target.namespace}/${yamlEditor.target.name}`}
          onClose={onClose}
        />
      }
    >
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
    </DeploymentModalShell>
  );
}
