import { useMemo, useState } from "react";
import type { Pod } from "../../../types";
import type { PodInspectorState } from "./types";

interface NodePodsTabProps {
  nodePods: Pod[];
  isInspectingPod: boolean;
  podInspector: PodInspectorState | null;
  onInspectPodDetails: (pod: Pod) => Promise<void>;
  onInspectPodLogs: (pod: Pod) => Promise<void>;
  onClearInspector: () => void;
}

export function NodePodsTab({
  nodePods,
  isInspectingPod,
  podInspector,
  onInspectPodDetails,
  onInspectPodLogs,
  onClearInspector,
}: NodePodsTabProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | string>("all");
  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");

  const statuses = useMemo(() => {
    return Array.from(new Set(nodePods.map((pod) => pod.status))).sort();
  }, [nodePods]);

  const filteredPods = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return nodePods.filter((pod) => {
      if (status !== "all" && pod.status !== status) {
        return false;
      }
      if (needle === "") {
        return true;
      }
      return `${pod.namespace} ${pod.name} ${pod.status}`.toLowerCase().includes(needle);
    });
  }, [nodePods, query, status]);

  const copyInspectorContent = async () => {
    if (!podInspector) {
      return;
    }
    try {
      await navigator.clipboard.writeText(podInspector.content);
      setCopyState("ok");
      window.setTimeout(() => setCopyState("idle"), 1200);
    } catch {
      setCopyState("err");
      window.setTimeout(() => setCopyState("idle"), 1500);
    }
  };

  return (
    <section className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Workloads on this node</p>

      <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by namespace, pod, or status"
            className="input flex-1 min-w-[220px]"
          />
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="input w-[170px]">
            <option value="all">All Statuses</option>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-zinc-500">
          Showing {filteredPods.length} of {nodePods.length} pods
        </p>
      </div>

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
            {filteredPods.map((pod) => (
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
                      onClick={() => void onInspectPodDetails(pod)}
                      className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      disabled={isInspectingPod}
                    >
                      Details
                    </button>
                    <button
                      onClick={() => void onInspectPodLogs(pod)}
                      className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      disabled={isInspectingPod}
                    >
                      Logs
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredPods.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-zinc-500" colSpan={7}>
                  No pods match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {podInspector && (
        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{podInspector.title}</p>
            <div className="flex items-center gap-2">
              <button onClick={() => void copyInspectorContent()} className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
                {copyState === "idle" ? "Copy" : copyState === "ok" ? "Copied" : "Copy Failed"}
              </button>
              <button
                onClick={onClearInspector}
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                Clear
              </button>
            </div>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap px-3 py-3 text-xs text-zinc-200">{podInspector.content}</pre>
        </div>
      )}
    </section>
  );
}
