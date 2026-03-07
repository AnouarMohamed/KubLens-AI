import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Pod, PodDetail, PodCreateRequest } from "../types";
import PodDetailModal from "./pods/PodDetailModal";
import PodStatusBadge from "./pods/PodStatusBadge";

type PodDetailTab = "specs" | "events";

const STATUSES = ["All", "Running", "Pending", "Failed", "Succeeded", "Unknown"] as const;

const defaultCreateForm: PodCreateRequest = {
  namespace: "default",
  name: "",
  image: "nginx:latest",
};

export default function Pods() {
  const [pods, setPods] = useState<Pod[]>([]);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUSES)[number]>("All");
  const [namespaceFilter, setNamespaceFilter] = useState("All");
  const [selectedPod, setSelectedPod] = useState<PodDetail | null>(null);
  const [activeTab, setActiveTab] = useState<PodDetailTab>("specs");
  const [logText, setLogText] = useState<string | null>(null);
  const [logPodName, setLogPodName] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<PodCreateRequest>(defaultCreateForm);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [podRows, namespaceRows] = await Promise.all([api.getPods(), api.getNamespaces()]);
      setPods(podRows);
      setNamespaces(namespaceRows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pods");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredPods = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pods.filter((pod) => {
      const matchesSearch = q === "" || `${pod.name} ${pod.namespace}`.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "All" || pod.status === statusFilter;
      const matchesNamespace = namespaceFilter === "All" || pod.namespace === namespaceFilter;
      return matchesSearch && matchesStatus && matchesNamespace;
    });
  }, [namespaceFilter, pods, search, statusFilter]);

  const openDetail = useCallback(async (namespace: string, podName: string) => {
    setIsBusy(true);
    try {
      const [detail, events] = await Promise.all([api.getPodDetail(namespace, podName), api.getPodEvents(namespace, podName)]);
      setSelectedPod({ ...detail, events });
      setActiveTab("specs");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pod details");
    } finally {
      setIsBusy(false);
    }
  }, []);

  const openLogs = useCallback(async (namespace: string, podName: string) => {
    setIsBusy(true);
    try {
      const logs = await api.getPodLogs(namespace, podName);
      setLogPodName(`${namespace}/${podName}`);
      setLogText(logs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pod logs");
    } finally {
      setIsBusy(false);
    }
  }, []);

  const createPod = useCallback(async () => {
    if (createForm.name.trim() === "") {
      setError("Pod name is required");
      return;
    }

    setIsBusy(true);
    try {
      await api.createPod({
        namespace: createForm.namespace.trim() || "default",
        name: createForm.name.trim(),
        image: createForm.image.trim() || "nginx:latest",
      });
      setCreateForm(defaultCreateForm);
      setShowCreateForm(false);
      await load();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pod");
    } finally {
      setIsBusy(false);
    }
  }, [createForm.image, createForm.name, createForm.namespace, load]);

  const restartPod = useCallback(
    async (namespace: string, podName: string) => {
      if (!window.confirm(`Restart pod ${namespace}/${podName}?`)) {
        return;
      }

      setIsBusy(true);
      try {
        await api.restartPod(namespace, podName);
        await load();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to restart pod");
      } finally {
        setIsBusy(false);
      }
    },
    [load],
  );

  const deletePod = useCallback(
    async (namespace: string, podName: string) => {
      if (!window.confirm(`Delete pod ${namespace}/${podName}?`)) {
        return;
      }

      setIsBusy(true);
      try {
        await api.deletePod(namespace, podName);
        await load();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete pod");
      } finally {
        setIsBusy(false);
      }
    },
    [load],
  );

  return (
    <div className="space-y-5">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Pods</h2>
          <p className="text-sm text-zinc-400 mt-1">Workload inventory with operational actions.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateForm((value) => !value)}
            className="btn"
          >
            {showCreateForm ? "Close Create" : "Create Pod"}
          </button>
          <button
            onClick={() => void load()}
            disabled={isLoading || isBusy}
            className="btn"
          >
            {isLoading ? "Loading" : "Refresh"}
          </button>
        </div>
      </header>

      {showCreateForm && (
        <div className="surface p-4">
          <p className="text-sm font-semibold text-zinc-100">Create Pod</p>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-xs text-zinc-400">
              Namespace
              <input
                value={createForm.namespace}
                onChange={(event) => setCreateForm((state) => ({ ...state, namespace: event.target.value }))}
                className="field mt-1 w-full"
              />
            </label>
            <label className="text-xs text-zinc-400">
              Pod Name
              <input
                value={createForm.name}
                onChange={(event) => setCreateForm((state) => ({ ...state, name: event.target.value }))}
                className="field mt-1 w-full"
              />
            </label>
            <label className="text-xs text-zinc-400">
              Image
              <input
                value={createForm.image}
                onChange={(event) => setCreateForm((state) => ({ ...state, image: event.target.value }))}
                className="field mt-1 w-full"
              />
            </label>
          </div>
          <div className="mt-3">
            <button
              onClick={() => void createPod()}
              disabled={isBusy}
              className="btn-solid"
            >
              {isBusy ? "Processing" : "Create"}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search pods"
          className="field w-72"
        />
        <select
          value={namespaceFilter}
          onChange={(event) => setNamespaceFilter(event.target.value)}
          className="field"
        >
          <option value="All">All namespaces</option>
          {namespaces.map((namespace) => (
            <option key={namespace} value={namespace}>
              {namespace}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as (typeof STATUSES)[number])}
          className="field"
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">{error}</div>}

      <div className="table-shell">
        <table className="min-w-full text-left text-sm">
          <thead className="table-head table-head-sticky">
            <tr>
              <th className="px-4 py-3 font-semibold">Pod</th>
              <th className="px-4 py-3 font-semibold">Namespace</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">CPU</th>
              <th className="px-4 py-3 font-semibold">Memory</th>
              <th className="px-4 py-3 font-semibold">Age</th>
              <th className="px-4 py-3 font-semibold">Restarts</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 text-zinc-200">
            {filteredPods.map((pod) => (
              <tr key={pod.id} className="table-row">
                <td className="px-4 py-3">
                  <button onClick={() => void openDetail(pod.namespace, pod.name)} className="text-left hover:underline">
                    <p className="font-medium">{pod.name}</p>
                    <p className="text-xs text-zinc-500">{pod.id}</p>
                  </button>
                </td>
                <td className="px-4 py-3 text-zinc-400">{pod.namespace}</td>
                <td className="px-4 py-3">
                  <PodStatusBadge status={pod.status} />
                </td>
                <td className="px-4 py-3 text-zinc-400">{pod.cpu}</td>
                <td className="px-4 py-3 text-zinc-400">{pod.memory}</td>
                <td className="px-4 py-3 text-zinc-400">{pod.age}</td>
                <td className="px-4 py-3 text-zinc-400">{pod.restarts}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => void openLogs(pod.namespace, pod.name)} className="btn-sm">
                      Logs
                    </button>
                    <button onClick={() => void restartPod(pod.namespace, pod.name)} className="btn-sm">
                      Restart
                    </button>
                    <button
                      onClick={() => void deletePod(pod.namespace, pod.name)}
                      className="btn-sm border-zinc-600"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {isLoading && <p className="px-4 py-8 text-center text-sm text-zinc-500">Loading pods...</p>}
        {!isLoading && filteredPods.length === 0 && <p className="px-4 py-8 text-center text-sm text-zinc-500">No pods match the current filters.</p>}
      </div>

      {logText !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl app-shell">
            <header className="border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-100">Pod Logs</p>
                <p className="text-xs text-zinc-500">{logPodName}</p>
              </div>
              <button onClick={() => setLogText(null)} className="btn-sm">
                Close
              </button>
            </header>
            <pre className="max-h-[60vh] overflow-auto p-4 text-xs leading-relaxed text-zinc-200 bg-zinc-900/60">{logText}</pre>
          </div>
        </div>
      )}

      <PodDetailModal selectedPod={selectedPod} activeTab={activeTab} onTabChange={setActiveTab} onClose={() => setSelectedPod(null)} />
    </div>
  );
}


