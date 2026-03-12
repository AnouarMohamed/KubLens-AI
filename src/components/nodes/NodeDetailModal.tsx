import { useEffect, useMemo, useState } from "react";
import { NodeConditionsTab } from "./detail/NodeConditionsTab";
import { NodeEventsTab } from "./detail/NodeEventsTab";
import { NodeMaintenanceTab } from "./detail/NodeMaintenanceTab";
import { NodeOverview } from "./detail/NodeOverview";
import { NodePodsTab } from "./detail/NodePodsTab";
import { TabButton } from "./detail/TabButton";
import type { NodeDetailModalProps, NodeDetailTab } from "./detail/types";
import { usePodInspector } from "./detail/usePodInspector";
import { sortNodeEvents } from "./detail/utils";

export default function NodeDetailModal({
  selectedNode,
  nodePods,
  nodeEvents,
  lastDrainPreview,
  isBusy,
  onCordon,
  onUncordon,
  onPreviewDrain,
  onDrain,
  onClose,
}: NodeDetailModalProps) {
  const [activeTab, setActiveTab] = useState<NodeDetailTab>("conditions");
  const { isInspectingPod, podInspector, inspectPodDetails, inspectPodLogs, clearPodInspector } = usePodInspector();

  useEffect(() => {
    setActiveTab("conditions");
    clearPodInspector();
  }, [clearPodInspector, selectedNode?.name]);

  const orderedNodeEvents = useMemo(() => sortNodeEvents(nodeEvents), [nodeEvents]);

  if (!selectedNode) {
    return null;
  }

  const preview = lastDrainPreview && lastDrainPreview.node === selectedNode.name ? lastDrainPreview : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-6xl rounded-lg border border-zinc-800 bg-zinc-900 max-h-[92vh] overflow-hidden flex flex-col">
        <header className="border-b border-zinc-800 px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">{selectedNode.name}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Node details, workloads, events, and maintenance workflow</p>
          </div>
          <div className="flex items-center gap-2">
            <TabButton
              label={`Conditions (${selectedNode.conditions.length})`}
              active={activeTab === "conditions"}
              onClick={() => setActiveTab("conditions")}
            />
            <TabButton
              label={`Pods (${nodePods.length})`}
              active={activeTab === "pods"}
              onClick={() => setActiveTab("pods")}
            />
            <TabButton
              label={`Events (${orderedNodeEvents.length})`}
              active={activeTab === "events"}
              onClick={() => setActiveTab("events")}
            />
            <TabButton
              label="Maintenance"
              active={activeTab === "maintenance"}
              onClick={() => setActiveTab("maintenance")}
            />
            <button onClick={onClose} className="btn-sm">
              Close
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-5">
          <NodeOverview selectedNode={selectedNode} />

          {activeTab === "conditions" && <NodeConditionsTab selectedNode={selectedNode} />}
          {activeTab === "pods" && (
            <NodePodsTab
              nodePods={nodePods}
              isInspectingPod={isInspectingPod}
              podInspector={podInspector}
              onInspectPodDetails={inspectPodDetails}
              onInspectPodLogs={inspectPodLogs}
              onClearInspector={clearPodInspector}
            />
          )}
          {activeTab === "events" && <NodeEventsTab orderedNodeEvents={orderedNodeEvents} />}
          {activeTab === "maintenance" && (
            <NodeMaintenanceTab
              selectedNode={selectedNode}
              nodePods={nodePods}
              preview={preview}
              isBusy={isBusy}
              onCordon={onCordon}
              onUncordon={onUncordon}
              onPreviewDrain={onPreviewDrain}
              onDrain={onDrain}
            />
          )}
        </div>
      </div>
    </div>
  );
}
