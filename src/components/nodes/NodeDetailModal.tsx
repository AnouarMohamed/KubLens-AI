import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import type { K8sEvent, NodeDetail, Pod } from "../../types";

type NodeDetailTab = "conditions" | "pods" | "events";

interface NodeDetailModalProps {
  selectedNode: NodeDetail | null;
  nodePods: Pod[];
  nodeEvents: K8sEvent[];
  onClose: () => void;
}

interface PodInspectorState {
  title: string;
  content: string;
}

export default function NodeDetailModal({ selectedNode, nodePods, nodeEvents, onClose }: NodeDetailModalProps) {
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
            <p className="text-xs text-zinc-500 mt-0.5">Node details, workloads, and event timeline</p>
          </div>
          <div className="flex items-center gap-2">
            <TabButton
              label={`Conditions (${selectedNode.conditions.length})`}
              active={activeTab === "conditions"}
              onClick={() => setActiveTab("conditions")}
            />
            <TabButton label={`Pods (${nodePods.length})`} active={activeTab === "pods"} onClick={() => setActiveTab("pods")} />
            <TabButton
              label={`Events (${orderedNodeEvents.length})`}
              active={activeTab === "events"}
              onClick={() => setActiveTab("events")}
            />
            <button onClick={onClose} className="btn-sm">
              Close
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-5">
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Capacity</p>
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
          ) : (
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
