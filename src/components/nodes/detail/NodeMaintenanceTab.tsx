import { useMemo, useState } from "react";
import type { NodeDetail, NodeDrainPreview, Pod } from "../../../types";
import { MaintenanceStep } from "./MaintenanceStep";

interface NodeMaintenanceTabProps {
  selectedNode: NodeDetail;
  nodePods: Pod[];
  preview: NodeDrainPreview | null;
  isBusy: boolean;
  onCordon: (name: string) => Promise<void>;
  onUncordon: (name: string) => Promise<void>;
  onPreviewDrain: (name: string) => Promise<void>;
  onDrain: (name: string, options?: { force?: boolean }) => Promise<void>;
}

export function NodeMaintenanceTab({
  selectedNode,
  nodePods,
  preview,
  isBusy,
  onCordon,
  onUncordon,
  onPreviewDrain,
  onDrain,
}: NodeMaintenanceTabProps) {
  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");
  const isCordoned = selectedNode.unschedulable === true || selectedNode.roles.toLowerCase().includes("cordoned");
  const workloadsCleared = nodePods.length === 0;
  const shouldForceDrain = Boolean(preview && preview.blockers.length > 0);

  const suggestedDrainCommand = useMemo(() => {
    const base = `kubectl drain ${selectedNode.name} --ignore-daemonsets --delete-emptydir-data`;
    return shouldForceDrain ? `${base} --force` : base;
  }, [selectedNode.name, shouldForceDrain]);

  const copyDrainCommand = async () => {
    try {
      await navigator.clipboard.writeText(suggestedDrainCommand);
      setCopyState("ok");
      window.setTimeout(() => setCopyState("idle"), 1200);
    } catch {
      setCopyState("err");
      window.setTimeout(() => setCopyState("idle"), 1500);
    }
  };

  return (
    <section className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Maintenance mode assistant</p>
      <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-zinc-400">Suggested drain command:</p>
          <button onClick={() => void copyDrainCommand()} className="btn-sm">
            {copyState === "idle" ? "Copy Command" : copyState === "ok" ? "Copied" : "Copy Failed"}
          </button>
        </div>
        <pre className="mt-2 overflow-auto rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-2 text-xs text-zinc-200">
          {suggestedDrainCommand}
        </pre>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <MaintenanceStep
          title="1. Cordon node"
          description={isCordoned ? "Node is already unschedulable." : "Prevent new pod scheduling on this node."}
          state={isCordoned ? "done" : "pending"}
          actionLabel={isCordoned ? "Refresh state" : "Cordon"}
          disabled={isBusy}
          onAction={() => void (isCordoned ? onPreviewDrain(selectedNode.name) : onCordon(selectedNode.name))}
        />
        <MaintenanceStep
          title="2. Preview drain safety"
          description={
            preview
              ? `Evictable: ${preview.evictable.length}, blockers: ${preview.blockers.length}`
              : "Check workloads and safety blockers before draining."
          }
          state={preview ? (preview.safeToDrain ? "done" : "warning") : "pending"}
          actionLabel="Preview Drain"
          disabled={isBusy}
          onAction={() => void onPreviewDrain(selectedNode.name)}
        />
        <MaintenanceStep
          title="3. Drain workloads"
          description={
            preview && preview.blockers.length > 0
              ? "Blockers detected. Use force drain only after reviewing risks."
              : "Evict pods safely according to disruption budgets."
          }
          state={workloadsCleared ? "done" : "pending"}
          actionLabel={preview && preview.blockers.length > 0 ? "Force Drain" : "Drain"}
          disabled={isBusy || !isCordoned}
          onAction={() => void onDrain(selectedNode.name, { force: shouldForceDrain })}
        />
        <MaintenanceStep
          title="4. Verify workload migration"
          description={
            workloadsCleared ? "No pods remain on the node." : `${nodePods.length} pod(s) still scheduled on this node.`
          }
          state={workloadsCleared ? "done" : "pending"}
          actionLabel="Refresh Verification"
          disabled={isBusy}
          onAction={() => void onPreviewDrain(selectedNode.name)}
        />
        <MaintenanceStep
          title="5. Uncordon / rollback"
          description="Re-enable scheduling when maintenance is complete."
          state={!isCordoned ? "done" : "pending"}
          actionLabel="Uncordon"
          disabled={isBusy || !isCordoned}
          onAction={() => void onUncordon(selectedNode.name)}
        />
      </div>

      {preview && preview.blockers.length > 0 && (
        <div className="rounded-md border border-[#eab308]/40 bg-[#eab308]/10 px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-200">Drain blockers</p>
          <div className="mt-2 space-y-1">
            {preview.blockers.slice(0, 6).map((blocker, index) => (
              <p key={`${blocker.kind}-${blocker.pod.namespace}-${blocker.pod.name}-${index}`} className="text-xs text-zinc-300">
                [{blocker.kind}] {blocker.pod.namespace}/{blocker.pod.name}: {blocker.message}
                {blocker.reference ? ` (${blocker.reference})` : ""}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
