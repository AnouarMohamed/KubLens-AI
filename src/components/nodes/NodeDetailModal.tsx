import type { NodeDetail } from "../../types";

interface NodeDetailModalProps {
  selectedNode: NodeDetail | null;
  onClose: () => void;
}

export default function NodeDetailModal({ selectedNode, onClose }: NodeDetailModalProps) {
  if (!selectedNode) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-4xl rounded-lg border border-zinc-800 bg-zinc-900 max-h-[90vh] overflow-hidden flex flex-col">
        <header className="border-b border-zinc-800 px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">{selectedNode.name}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Node details and conditions</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            Close
          </button>
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
                      <td className="px-4 py-3 text-zinc-400">{condition.reason}</td>
                      <td className="px-4 py-3 text-zinc-400">{condition.lastTransitionTime}</td>
                      <td className="px-4 py-3 text-zinc-400">{condition.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Addresses</p>
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
            </div>
          </section>
        </div>
      </div>
    </div>
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
