import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import type { K8sEvent, NodeDetail, NodeDrainPreview, Pod } from "../../types";

type NodeDetailTab = "conditions" | "pods" | "events" | "maintenance";

interface NodeDetailModalProps {
  selectedNode: NodeDetail | null;
  nodePods: Pod[];
  nodeEvents: K8sEvent[];
  lastDrainPreview: NodeDrainPreview | null;
  isBusy: boolean;
  onCordon: (name: string) => Promise<void>;
  onUncordon: (name: string) => Promise<void>;
  onPreviewDrain: (name: string) => Promise<void>;
  onDrain: (name: string, force?: boolean) => Promise<void>;
  onClose: () => void;
}

interface PodInspectorState {
  title: string;
  content: string;
}

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
  const [isInspectingPod, setIsInspectingPod] = useState(false);
  const [podInspector, setPodInspector] = useState<PodInspectorState | null>(null);

  useEffect(() => {
    setActiveTab("conditions");
    setPodInspector(null);
  }, [selectedNode?.name]);

  const orderedNodeEvents = useMemo(() => {
    return [...nodeEvents].sort((a, b) => {
      const left = a.lastTimestamp ?? "";
      const right = b.lastTimestamp ?? "";
      return right.localeCompare(left);
    });
  }, [nodeEvents]);

  if (!selectedNode) {
    return null;
  }

  const currentCPU = parsePercent(selectedNode.cpuUsage);
  const currentMemory = parsePercent(selectedNode.memUsage);
  const cpuHeadroom = Math.max(0, 100 - currentCPU);
  const memoryHeadroom = Math.max(0, 100 - currentMemory);
  const cpuProjection = estimateMinutesToThreshold(selectedNode.cpuHistory ?? [], 85, 2);
  const preview = lastDrainPreview && lastDrainPreview.node === selectedNode.name ? lastDrainPreview : null;
  const isCordoned = selectedNode.unschedulable === true || selectedNode.roles.toLowerCase().includes("cordoned");
  const workloadsCleared = nodePods.length === 0;

  const inspectPodDetails = async (pod: Pod) => {
    setIsInspectingPod(true);
    try {
      const detail = await api.getPodDetail(pod.namespace, pod.name);
      const payload = JSON.stringify(detail, null, 2);
      setPodInspector({
        title: `Details: ${pod.namespace}/${pod.name}`,
        content: payload,
      });
    } catch (err) {
      setPodInspector({
        title: `Details: ${pod.namespace}/${pod.name}`,
        content: err instanceof Error ? `Failed to load pod details: ${err.message}` : "Failed to load pod details.",
      });
    } finally {
      setIsInspectingPod(false);
    }
  };

  const inspectPodLogs = async (pod: Pod) => {
    setIsInspectingPod(true);
    try {
      const logs = await api.getPodLogs(pod.namespace, pod.name, 80);
      setPodInspector({
        title: `Logs: ${pod.namespace}/${pod.name}`,
        content: logs.trim() === "" ? "No logs returned." : logs,
      });
    } catch (err) {
      setPodInspector({
        title: `Logs: ${pod.namespace}/${pod.name}`,
        content: err instanceof Error ? `Failed to load pod logs: ${err.message}` : "Failed to load pod logs.",
      });
    } finally {
      setIsInspectingPod(false);
    }
  };

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
            <TabButton label="Maintenance" active={activeTab === "maintenance"} onClick={() => setActiveTab("maintenance")} />
            <button onClick={onClose} className="btn-sm">
              Close
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-5">
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Capacity and risk trend</p>
            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <InfoCard label="CPU" capacity={selectedNode.capacity.cpu} allocatable={selectedNode.allocatable.cpu} />
              <InfoCard
                label="Memory"
                capacity={selectedNode.capacity.memory}
                allocatable={selectedNode.allocatable.memory}
              />
              <InfoCard
                label="Pods"
                capacity={selectedNode.capacity.pods}
                allocatable={selectedNode.allocatable.pods}
              />
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <SignalCard
                title="CPU headroom"
                value={`${cpuHeadroom.toFixed(1)}%`}
                note={`Current usage ${selectedNode.cpuUsage}`}
                tone={cpuHeadroom < 20 ? "warning" : "normal"}
              />
              <SignalCard
                title="Memory headroom"
                value={`${memoryHeadroom.toFixed(1)}%`}
                note={`Current usage ${selectedNode.memUsage}`}
                tone={memoryHeadroom < 20 ? "warning" : "normal"}
              />
              <SignalCard
                title="CPU risk trend"
                value={cpuProjection.message}
                note={cpuProjection.detail}
                tone={cpuProjection.tone}
              />
            </div>
          </section>

          {activeTab === "conditions" ? (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Conditions</p>
              <div className="mt-2 rounded-md border border-zinc-800 overflow-hidden">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Reason</th>
                      <th className="px-4 py-3 font-semibold">Last Transition</th>
                      <th className="px-4 py-3 font-semibold">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 text-zinc-200">
                    {selectedNode.conditions.map((condition) => (
                      <tr key={`${condition.type}-${condition.reason}`}>
                        <td className="px-4 py-3 font-medium">{condition.type}</td>
                        <td className="px-4 py-3">{condition.status}</td>
                        <td className="px-4 py-3 text-zinc-400">{condition.reason || "-"}</td>
                        <td className="px-4 py-3 text-zinc-400">{condition.lastTransitionTime || "-"}</td>
                        <td className="px-4 py-3 text-zinc-400">{condition.message || "-"}</td>
                      </tr>
                    ))}
                    {selectedNode.conditions.length === 0 && (
                      <tr>
                        <td className="px-4 py-8 text-center text-zinc-500" colSpan={5}>
                          No condition rows available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">Addresses</p>
              <div className="mt-2 rounded-md border border-zinc-800 divide-y divide-zinc-800">
                {selectedNode.addresses.map((address) => (
                  <div
                    key={`${address.type}-${address.address}`}
                    className="px-4 py-2 text-sm flex items-center justify-between gap-3"
                  >
                    <span className="font-medium text-zinc-100">{address.type}</span>
                    <span className="text-zinc-400">{address.address}</span>
                  </div>
                ))}
                {selectedNode.addresses.length === 0 && (
                  <p className="px-4 py-3 text-sm text-zinc-500">No address rows available.</p>
                )}
              </div>
            </section>
          ) : activeTab === "pods" ? (
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Workloads on this node</p>
              <div className="rounded-md border border-zinc-800 overflow-hidden">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Namespace</th>
                      <th className="px-4 py-3 font-semibold">Pod</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Restarts</th>
                      <th className="px-4 py-3 font-semibold">CPU</th>
                      <th className="px-4 py-3 font-semibold">Memory</th>
                      <th className="px-4 py-3 font-semibold">Quick Links</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 text-zinc-200">
                    {nodePods.map((pod) => (
                      <tr key={pod.id}>
                        <td className="px-4 py-3 text-zinc-400">{pod.namespace}</td>
                        <td className="px-4 py-3 font-medium">{pod.name}</td>
                        <td className="px-4 py-3">{pod.status}</td>
                        <td className="px-4 py-3 text-zinc-400">{pod.restarts}</td>
                        <td className="px-4 py-3 text-zinc-400">{pod.cpu}</td>
                        <td className="px-4 py-3 text-zinc-400">{pod.memory}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => void inspectPodDetails(pod)}
                              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                              disabled={isInspectingPod}
                            >
                              Details
                            </button>
                            <button
                              onClick={() => void inspectPodLogs(pod)}
                              className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                              disabled={isInspectingPod}
                            >
                              Logs
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {nodePods.length === 0 && (
                      <tr>
                        <td className="px-4 py-8 text-center text-zinc-500" colSpan={7}>
                          No pods are currently scheduled on this node.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {podInspector && (
                <div className="rounded-md border border-zinc-800 bg-zinc-950/60 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{podInspector.title}</p>
                    <button
                      onClick={() => setPodInspector(null)}
                      className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      Clear
                    </button>
                  </div>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap px-3 py-3 text-xs text-zinc-200">
                    {podInspector.content}
                  </pre>
                </div>
              )}
            </section>
          ) : activeTab === "events" ? (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Node event timeline</p>
              <div className="mt-2 rounded-md border border-zinc-800 overflow-hidden">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Reason</th>
                      <th className="px-4 py-3 font-semibold">Age</th>
                      <th className="px-4 py-3 font-semibold">From</th>
                      <th className="px-4 py-3 font-semibold">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 text-zinc-200">
                    {orderedNodeEvents.map((event, index) => (
                      <tr key={`${event.reason}-${event.lastTimestamp ?? index}`}>
                        <td className="px-4 py-3">{event.type || "-"}</td>
                        <td className="px-4 py-3 font-medium">{event.reason || "-"}</td>
                        <td className="px-4 py-3 text-zinc-400">{event.age || "-"}</td>
                        <td className="px-4 py-3 text-zinc-400">{event.from || "-"}</td>
                        <td className="px-4 py-3 text-zinc-400">{event.message || "-"}</td>
                      </tr>
                    ))}
                    {orderedNodeEvents.length === 0 && (
                      <tr>
                        <td className="px-4 py-8 text-center text-zinc-500" colSpan={5}>
                          No node events available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Maintenance mode assistant</p>
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
                  onAction={() => void onDrain(selectedNode.name, Boolean(preview && preview.blockers.length > 0))}
                />
                <MaintenanceStep
                  title="4. Verify workload migration"
                  description={
                    workloadsCleared
                      ? "No pods remain on the node."
                      : `${nodePods.length} pod(s) still scheduled on this node.`
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
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs ${
        active
          ? "border-[#00d4a8]/50 bg-[#00d4a8]/15 text-zinc-100"
          : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
      }`}
    >
      {label}
    </button>
  );
}

function InfoCard({ label, capacity, allocatable }: { label: string; capacity: string; allocatable: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-sm text-zinc-200">Capacity: {capacity}</p>
      <p className="text-sm text-zinc-200">Allocatable: {allocatable}</p>
    </div>
  );
}

function SignalCard({
  title,
  value,
  note,
  tone,
}: {
  title: string;
  value: string;
  note: string;
  tone: "normal" | "warning" | "critical";
}) {
  const toneClass =
    tone === "critical"
      ? "border-[#ff4444]/45 bg-[#ff4444]/12"
      : tone === "warning"
        ? "border-[#eab308]/45 bg-[#eab308]/12"
        : "border-zinc-800 bg-zinc-900/60";

  return (
    <div className={`rounded-md border px-3 py-2 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-1 text-sm text-zinc-100">{value}</p>
      <p className="text-xs text-zinc-400 mt-1">{note}</p>
    </div>
  );
}

function MaintenanceStep({
  title,
  description,
  state,
  actionLabel,
  disabled,
  onAction,
}: {
  title: string;
  description: string;
  state: "pending" | "done" | "warning";
  actionLabel: string;
  disabled: boolean;
  onAction: () => void;
}) {
  const stateClass =
    state === "done"
      ? "border-[#34c759]/45 bg-[#34c759]/12"
      : state === "warning"
        ? "border-[#eab308]/45 bg-[#eab308]/12"
        : "border-zinc-800 bg-zinc-900/60";

  return (
    <div className={`rounded-md border p-3 ${stateClass}`}>
      <p className="text-sm font-semibold text-zinc-100">{title}</p>
      <p className="mt-1 text-xs text-zinc-400">{description}</p>
      <button onClick={onAction} className="btn-sm mt-3" disabled={disabled}>
        {actionLabel}
      </button>
    </div>
  );
}

function parsePercent(raw: string): number {
  const value = Number.parseFloat(raw.replace("%", ""));
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 100);
}

function estimateMinutesToThreshold(history: Array<{ time: string; value: number }>, threshold: number, sampleMinutes: number) {
  if (history.length < 2) {
    return {
      message: "Insufficient history",
      detail: "Collect more CPU data points to project risk.",
      tone: "normal" as const,
    };
  }

  const first = history[0].value;
  const last = history[history.length - 1].value;
  const slopePerSample = (last - first) / Math.max(1, history.length - 1);
  if (slopePerSample <= 0) {
    return {
      message: "Stable or decreasing",
      detail: "CPU trend is not currently rising.",
      tone: "normal" as const,
    };
  }

  if (last >= threshold) {
    return {
      message: `Above ${threshold}% now`,
      detail: "CPU already exceeds the risk threshold.",
      tone: "critical" as const,
    };
  }

  const samplesUntilThreshold = (threshold - last) / slopePerSample;
  const minutes = Math.max(1, Math.round(samplesUntilThreshold * sampleMinutes));
  return {
    message: `~${minutes}m to ${threshold}%`,
    detail: `Projected from recent CPU history (${history.length} points).`,
    tone: minutes < 30 ? ("warning" as const) : ("normal" as const),
  };
}
