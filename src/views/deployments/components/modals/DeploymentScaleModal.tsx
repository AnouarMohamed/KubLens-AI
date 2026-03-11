import type { ResourceRecord } from "../../../../types";
import { DeploymentModalHeader, DeploymentModalShell } from "./DeploymentModalPrimitives";

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
    <DeploymentModalShell
      maxWidthClass="max-w-md"
      header={
        <DeploymentModalHeader
          title="Scale Deployment"
          subtitle={`${scaleTarget.namespace}/${scaleTarget.name}`}
          onClose={onClose}
        />
      }
    >
      <div className="space-y-3 p-4">
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
    </DeploymentModalShell>
  );
}
