import type { PodDetail, PodStatus } from "../../types";

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

  const events = selectedPod.events ?? [];
  const warningEvents = events.filter((event) => event.type.toLowerCase() === "warning").length;
  const normalEvents = events.filter((event) => event.type.toLowerCase() !== "warning").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-6xl rounded-2xl border border-zinc-700 bg-zinc-900 max-h-[92vh] overflow-hidden flex flex-col shadow-[0_20px_45px_rgba(15,23,42,0.24)]">
        <header className="border-b border-zinc-700 px-5 py-4 flex items-start justify-between gap-4 bg-zinc-900/95">
          <div>
            <h3 className="text-xl font-semibold text-zinc-100 tracking-tight">{selectedPod.name}</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Namespace: <span className="text-zinc-300">{selectedPod.namespace}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusChip label="Status" value={selectedPod.status} tone={podStatusTone(selectedPod.status)} />
              <StatusChip label="Restarts" value={String(selectedPod.restarts)} tone={selectedPod.restarts > 0 ? "warning" : "neutral"} />
              <StatusChip label="Containers" value={String(selectedPod.containers.length)} tone="neutral" />
              <StatusChip label="Events" value={String(events.length)} tone={events.length > 0 ? "info" : "neutral"} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <TabButton active={activeTab === "specs"} label="Specifications" onClick={() => onTabChange("specs")} />
            <TabButton active={activeTab === "events"} label="Events" onClick={() => onTabChange("events")} />
            <button onClick={onClose} className="btn-sm">
              Close
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-5 space-y-5 bg-zinc-900/75">
          {activeTab === "specs" ? (
            <>
              <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                <InfoCard label="Namespace" value={selectedPod.namespace} />
                <InfoCard label="Node" value={selectedPod.nodeName || "-"} />
                <InfoCard label="Status" value={selectedPod.status} />
                <InfoCard label="Pod IP" value={selectedPod.podIP || "-"} />
                <InfoCard label="Host IP" value={selectedPod.hostIP || "-"} />
                <InfoCard label="Age" value={selectedPod.age} />
              </section>

              <section className="space-y-3">
                <SectionTitle title="Containers" subtitle="Runtime, resources, environment, and mounts" />
                {selectedPod.containers.map((container) => (
                  <article key={container.name} className="rounded-xl border border-zinc-700 bg-zinc-900/80 overflow-hidden">
                    <header className="border-b border-zinc-700 px-4 py-3 bg-zinc-800/40">
                      <p className="text-sm font-semibold text-zinc-100">{container.name}</p>
                      <p className="text-xs text-zinc-400 mt-0.5 font-mono break-all">{container.image || "-"}</p>
                    </header>

                    <div className="p-4 space-y-4">
                      <section>
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Resources</p>
                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                          <MetricTile label="Req CPU" value={container.resources?.requests?.cpu || "-"} />
                          <MetricTile label="Req Memory" value={container.resources?.requests?.memory || "-"} />
                          <MetricTile label="Limit CPU" value={container.resources?.limits?.cpu || "-"} />
                          <MetricTile label="Limit Memory" value={container.resources?.limits?.memory || "-"} />
                        </div>
                      </section>

                      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Environment Variables</p>
                          <div className="mt-2 rounded-lg border border-zinc-700 overflow-hidden">
                            {(container.env || []).length > 0 ? (
                              <table className="min-w-full text-sm">
                                <tbody className="divide-y divide-zinc-700 text-zinc-200">
                                  {container.env?.map((env) => (
                                    <tr key={env.name}>
                                      <td className="px-3 py-2 font-medium">{env.name}</td>
                                      <td className="px-3 py-2 text-zinc-400 break-all">{env.value || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="px-3 py-3 text-sm text-zinc-500">No environment variables</p>
                            )}
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Volume Mounts</p>
                          <div className="mt-2 rounded-lg border border-zinc-700 overflow-hidden">
                            {(container.volumeMounts || []).length > 0 ? (
                              <table className="min-w-full text-sm">
                                <tbody className="divide-y divide-zinc-700 text-zinc-200">
                                  {container.volumeMounts?.map((mount) => (
                                    <tr key={`${mount.name}-${mount.mountPath}`}>
                                      <td className="px-3 py-2 font-medium">{mount.name}</td>
                                      <td className="px-3 py-2 text-zinc-400 break-all">{mount.mountPath}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <p className="px-3 py-3 text-sm text-zinc-500">No volume mounts</p>
                            )}
                          </div>
                        </div>
                      </section>
                    </div>
                  </article>
                ))}
              </section>

              <section>
                <SectionTitle title="Pod Volumes" subtitle="Declared pod-level volumes" />
                <div className="mt-2 rounded-xl border border-zinc-700 bg-zinc-900/80 p-3">
                  {(selectedPod.volumes || []).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedPod.volumes?.map((volume) => (
                        <span key={volume.name} className="rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-xs text-zinc-300">
                          {volume.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-500">No volumes declared.</p>
                  )}
                </div>
              </section>
            </>
          ) : (
            <section className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <InfoCard label="Total Events" value={String(events.length)} />
                <InfoCard label="Warning Events" value={String(warningEvents)} />
                <InfoCard label="Other Events" value={String(normalEvents)} />
              </div>

              <div className="rounded-xl border border-zinc-700 overflow-hidden">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-800/70 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Reason</th>
                      <th className="px-4 py-3 font-semibold">Age</th>
                      <th className="px-4 py-3 font-semibold">From</th>
                      <th className="px-4 py-3 font-semibold">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-700 text-zinc-200">
                    {events.map((event, index) => (
                      <tr key={`${event.reason}-${index}`} className="hover:bg-zinc-800/45">
                        <td className="px-4 py-3">
                          <EventTypeBadge type={event.type} />
                        </td>
                        <td className="px-4 py-3 font-medium">{event.reason}</td>
                        <td className="px-4 py-3 text-zinc-400 whitespace-nowrap">{event.age}</td>
                        <td className="px-4 py-3 text-zinc-400">{event.from}</td>
                        <td className="px-4 py-3 text-zinc-300 leading-relaxed">{event.message}</td>
                      </tr>
                    ))}
                    {events.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                          No events found for this pod.
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

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
        active ? "border-[#2496ed] bg-[#2496ed]/18 text-zinc-100" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
      }`}
    >
      {label}
    </button>
  );
}

function StatusChip({ label, value, tone }: { label: string; value: string; tone: "neutral" | "info" | "warning" | "critical" }) {
  const toneClass =
    tone === "critical"
      ? "border-[#d946ef]/45 bg-[#d946ef]/12"
      : tone === "warning"
        ? "border-[#eab308]/45 bg-[#eab308]/12"
        : tone === "info"
          ? "border-[#2496ed]/45 bg-[#2496ed]/12"
          : "border-zinc-700 bg-zinc-800/60";

  return (
    <div className={`rounded-md border px-2 py-1 text-xs text-zinc-200 ${toneClass}`}>
      <span className="text-zinc-400">{label}:</span> {value}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-sm text-zinc-200 break-words">{value}</p>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/45 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-sm text-zinc-200 mt-0.5">{value}</p>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-100">{title}</p>
      <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

function EventTypeBadge({ type }: { type: string }) {
  const normalized = type.toLowerCase();
  const isWarning = normalized === "warning";

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        isWarning ? "border-[#eab308]/45 bg-[#eab308]/12 text-zinc-100" : "border-[#34c759]/45 bg-[#34c759]/12 text-zinc-100"
      }`}
    >
      {type || "-"}
    </span>
  );
}

function podStatusTone(status: PodStatus): "neutral" | "info" | "warning" | "critical" {
  if (status === "Failed") {
    return "critical";
  }
  if (status === "Pending") {
    return "warning";
  }
  if (status === "Running") {
    return "info";
  }
  return "neutral";
}
