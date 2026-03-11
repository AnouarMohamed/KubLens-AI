import type { DeploymentDetail } from "../../types";
import { DeploymentInfoRow, DeploymentModalHeader, DeploymentModalShell } from "./DeploymentModalPrimitives";

interface DeploymentDetailModalProps {
  detail: DeploymentDetail | null;
  onClose: () => void;
}

export function DeploymentDetailModal({ detail, onClose }: DeploymentDetailModalProps) {
  if (!detail) {
    return null;
  }

  return (
    <DeploymentModalShell
      maxWidthClass="max-w-6xl"
      header={
        <DeploymentModalHeader
          title="Deployment Detail"
          subtitle={`${detail.target.namespace}/${detail.target.name}`}
          onClose={onClose}
        />
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-2">
          <DeploymentInfoRow label="Rollout" value={detail.target.status} />
          <DeploymentInfoRow label="Age" value={detail.target.age} />
          <DeploymentInfoRow label="Summary" value={detail.target.summary || "n/a"} />
        </div>
        <pre className="max-h-[65vh] overflow-auto rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-200">
          {detail.yaml}
        </pre>
      </div>
    </DeploymentModalShell>
  );
}
