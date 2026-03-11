import type { DiagnosticsResult, K8sEvent, Pod } from "../../../types";
import { formatTimestamp, restartCountColorClass } from "../utils";

export function TopRiskPodsCard({ pods }: { pods: Pod[] }) {
  return (
    <div className="surface p-5">
      <h3 className="text-sm font-semibold text-zinc-100">Top Risk Pods</h3>
      <p className="text-xs text-zinc-400 mt-1">Highest restart pressure.</p>
      <div className="mt-3">
        {pods.map((pod, index) => (
          <div
            key={pod.id}
            className={`flex items-center justify-between py-2.5 gap-3 ${index > 0 ? "border-t border-[#1f1f1f]" : ""}`}
          >
            <div className="min-w-0">
              <p className="text-xs font-mono font-semibold text-[#e8e8e8] truncate">{pod.name}</p>
              <p className="text-[11px] font-mono text-[#444444] mt-0.5">
                {pod.namespace} | {pod.status}
              </p>
            </div>
            <span className={`text-xs font-mono font-semibold flex-shrink-0 ${restartCountColorClass(pod.restarts)}`}>
              {pod.restarts}r
            </span>
          </div>
        ))}
        {pods.length === 0 && <p className="text-sm text-zinc-400">No pod risk signals yet.</p>}
      </div>
    </div>
  );
}

export function RecentEventsCard({ events }: { events: K8sEvent[] }) {
  return (
    <div className="surface p-5">
      <h3 className="text-sm font-semibold text-zinc-100">Recent Events</h3>
      <p className="text-xs text-zinc-400 mt-1">Latest {Math.min(events.length, 8)} items.</p>
      <div className="mt-3">
        {events.slice(0, 8).map((event, index) => (
          <div
            key={`${event.reason}-${index}`}
            className={`flex items-start justify-between py-2.5 gap-3 ${index > 0 ? "border-t border-[#1f1f1f]" : ""}`}
          >
            <div className="min-w-0">
              <p className="text-xs font-mono font-semibold text-[#e8e8e8]">{event.reason}</p>
              <p className="text-[11px] font-mono text-[#444444] mt-0.5 leading-relaxed line-clamp-2">
                {event.message}
              </p>
            </div>
            <span className="text-[11px] font-mono text-[#666666] flex-shrink-0">{event.age}</span>
          </div>
        ))}
        {events.length === 0 && <p className="text-sm text-zinc-400">No recent events available.</p>}
      </div>
    </div>
  );
}

export function HealthSnapshotCard({ diagnostics }: { diagnostics: DiagnosticsResult | null }) {
  return (
    <div className="surface p-5">
      <h3 className="text-sm font-semibold text-zinc-100">Health Snapshot</h3>
      <p className="text-xs text-zinc-400 mt-1">At-a-glance diagnostics state.</p>
      {diagnostics ? (
        <div className="mt-3">
          {[
            {
              label: "Health Score",
              value: `${diagnostics.healthScore}/100`,
              critical: diagnostics.healthScore < 75,
            },
            {
              label: "Critical",
              value: String(diagnostics.criticalIssues),
              critical: diagnostics.criticalIssues > 0,
            },
            { label: "Warnings", value: String(diagnostics.warningIssues), critical: false },
          ].map((item, index) => (
            <div
              key={item.label}
              className={`flex items-center justify-between py-2.5 gap-3 ${index > 0 ? "border-t border-[#1f1f1f]" : ""}`}
            >
              <span className="text-[11px] font-mono text-[#444444]">{item.label}</span>
              <span
                className={`text-xs font-mono font-semibold ${item.critical ? "text-[#ff4444]" : "text-[#e8e8e8]"}`}
              >
                {item.value}
              </span>
            </div>
          ))}
          <div className="mt-3">
            <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">Health Trend</p>
            <div className="mt-2 h-1 rounded-none bg-zinc-700 overflow-hidden">
              <div
                className="h-full rounded-none bg-[#3b82f6]"
                style={{ width: `${Math.max(0, Math.min(100, diagnostics.healthScore))}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-zinc-500 mt-3">Updated: {formatTimestamp(diagnostics.timestamp)}</p>
        </div>
      ) : (
        <p className="text-sm text-zinc-400 mt-3">Diagnostics data unavailable.</p>
      )}
    </div>
  );
}
