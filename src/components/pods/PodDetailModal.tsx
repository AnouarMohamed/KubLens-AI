import type { PodDetail } from "../../types";

type PodDetailTab = "specs" | "events";

interface PodDetailModalProps {
  selectedPod: PodDetail | null;
  activeTab: PodDetailTab;
  onTabChange: (tab: PodDetailTab) => void;
  onClose: () => void;
}

export default function PodDetailModal({ selectedPod, activeTab, onTabChange, onClose }: PodDetailModalProps) {
  if (!selectedPod) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl rounded-lg border border-zinc-800 bg-zinc-900 max-h-[90vh] overflow-hidden flex flex-col">
        <header className="border-b border-zinc-800 px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">{selectedPod.name}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Namespace: {selectedPod.namespace}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onTabChange("specs")}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                activeTab === "specs" ? "border-[#2496ed] bg-[#2496ed] text-white" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              Specifications
            </button>
            <button
              onClick={() => onTabChange("events")}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                activeTab === "events" ? "border-[#2496ed] bg-[#2496ed] text-white" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              Events
            </button>
            <button onClick={onClose} className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
              Close
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-5">
          {activeTab === "specs" ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <InfoCard label="Namespace" value={selectedPod.namespace} />
                <InfoCard label="Node" value={selectedPod.nodeName || "-"} />
                <InfoCard label="Pod IP" value={selectedPod.podIP || "-"} />
                <InfoCard label="Age" value={selectedPod.age} />
              </div>

              {selectedPod.containers.map((container) => (
                <section key={container.name} className="rounded-md border border-zinc-800">
                  <header className="border-b border-zinc-800 px-4 py-3 bg-zinc-900/60">
                    <p className="text-sm font-semibold text-zinc-100">Container: {container.name}</p>
                    <p className="text-xs text-zinc-400">Image: {container.image || "-"}</p>
                  </header>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
                    <section>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Resources</p>
                      <div className="mt-2 space-y-1 text-sm text-zinc-300">
                        <p>Requests CPU: {container.resources?.requests?.cpu || "-"}</p>
                        <p>Requests Memory: {container.resources?.requests?.memory || "-"}</p>
                        <p>Limits CPU: {container.resources?.limits?.cpu || "-"}</p>
                        <p>Limits Memory: {container.resources?.limits?.memory || "-"}</p>
                      </div>
                    </section>

                    <section>
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Environment Variables</p>
                      <div className="mt-2 rounded-md border border-zinc-800 divide-y divide-zinc-800">
                        {(container.env || []).length > 0 ? (
                          container.env?.map((env) => (
                            <div key={env.name} className="px-3 py-2 text-sm flex items-center justify-between gap-3">
                              <span className="font-medium text-zinc-100">{env.name}</span>
                              <span className="text-zinc-400">{env.value || "-"}</span>
                            </div>
                          ))
                        ) : (
                          <p className="px-3 py-3 text-sm text-zinc-500">No environment variables</p>
                        )}
                      </div>
                    </section>
                  </div>
                </section>
              ))}
            </>
          ) : (
            <div className="rounded-md border border-zinc-800 overflow-hidden">
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
                  {(selectedPod.events || []).map((event, index) => (
                    <tr key={`${event.reason}-${index}`}>
                      <td className="px-4 py-3">{event.type}</td>
                      <td className="px-4 py-3">{event.reason}</td>
                      <td className="px-4 py-3 text-zinc-400">{event.age}</td>
                      <td className="px-4 py-3 text-zinc-400">{event.from}</td>
                      <td className="px-4 py-3 text-zinc-400">{event.message}</td>
                    </tr>
                  ))}
                  {(selectedPod.events || []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                        No events found for this pod.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-sm text-zinc-200">{value}</p>
    </div>
  );
}


