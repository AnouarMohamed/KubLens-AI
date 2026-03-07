import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthSession } from "../../context/AuthSessionContext";
import { api } from "../../lib/api";
import type { ResourceRecord } from "../../types";

interface DeploymentDetail {
  target: ResourceRecord;
  yaml: string;
}

export default function Deployments() {
  const { can, isLoading: authLoading } = useAuthSession();
  const [items, setItems] = useState<ResourceRecord[]>([]);
  const [search, setSearch] = useState("");
  const [namespaceFilter, setNamespaceFilter] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scaleTarget, setScaleTarget] = useState<ResourceRecord | null>(null);
  const [scaleReplicas, setScaleReplicas] = useState("1");
  const [detail, setDetail] = useState<DeploymentDetail | null>(null);
  const [yamlEditor, setYAMLEditor] = useState<DeploymentDetail | null>(null);
  const canRead = can("read");
  const canWrite = can("write");

  const load = useCallback(async () => {
    if (!canRead) {
      setItems([]);
      setError("Authenticate to view deployments.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.getResources("deployments");
      setItems(response.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deployments");
    } finally {
      setIsLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    void load();
  }, [authLoading, load]);

  const namespaces = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.namespace).filter((value): value is string => typeof value === "string" && value !== ""))).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchNamespace = namespaceFilter === "All" || item.namespace === namespaceFilter;
      const matchSearch = q === "" || `${item.name} ${item.namespace ?? ""} ${item.status} ${item.summary ?? ""}`.toLowerCase().includes(q);
      return matchNamespace && matchSearch;
    });
  }, [items, namespaceFilter, search]);

  const openDetail = useCallback(
    async (item: ResourceRecord) => {
      if (!canRead || !item.namespace) {
        setError("Deployment detail requires read access and namespace.");
        return;
      }
      setIsActing(true);
      try {
        const response = await api.getResourceYAML("deployments", item.namespace, item.name);
        setDetail({ target: item, yaml: response.yaml });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load deployment detail");
      } finally {
        setIsActing(false);
      }
    },
    [canRead],
  );

  const openYAMLEditor = useCallback(
    async (item: ResourceRecord) => {
      if (!canWrite || !item.namespace) {
        setError("Your role does not allow YAML actions.");
        return;
      }
      setIsActing(true);
      try {
        const response = await api.getResourceYAML("deployments", item.namespace, item.name);
        setYAMLEditor({ target: item, yaml: response.yaml });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load deployment YAML");
      } finally {
        setIsActing(false);
      }
    },
    [canWrite],
  );

  const applyYAML = useCallback(async () => {
    if (!canWrite || !yamlEditor?.target.namespace) {
      setError("Your role does not allow YAML actions.");
      return;
    }
    setIsActing(true);
    try {
      const response = await api.applyResourceYAML("deployments", yamlEditor.target.namespace, yamlEditor.target.name, { yaml: yamlEditor.yaml });
      setMessage(response.message);
      setYAMLEditor(null);
      await load();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply YAML");
    } finally {
      setIsActing(false);
    }
  }, [canWrite, load, yamlEditor]);

  const scale = useCallback(async () => {
    if (!canWrite || !scaleTarget?.namespace) {
      setError("Your role does not allow scaling.");
      return;
    }
    const replicas = Number.parseInt(scaleReplicas, 10);
    if (!Number.isFinite(replicas) || replicas < 0) {
      setError("Replicas must be a positive integer or zero.");
      return;
    }

    setIsActing(true);
    try {
      const response = await api.scaleResource("deployments", scaleTarget.namespace, scaleTarget.name, { replicas });
      setMessage(response.message);
      setScaleTarget(null);
      await load();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scale deployment");
    } finally {
      setIsActing(false);
    }
  }, [canWrite, load, scaleReplicas, scaleTarget]);

  const restart = useCallback(
    async (item: ResourceRecord) => {
      if (!canWrite || !item.namespace) {
        setError("Your role does not allow restart.");
        return;
      }
      if (!window.confirm(`Restart deployment ${item.namespace}/${item.name}?`)) {
        return;
      }
      setIsActing(true);
      try {
        const response = await api.restartResource("deployments", item.namespace, item.name);
        setMessage(response.message);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to restart deployment");
      } finally {
        setIsActing(false);
      }
    },
    [canWrite, load],
  );

  const rollback = useCallback(
    async (item: ResourceRecord) => {
      if (!canWrite || !item.namespace) {
        setError("Your role does not allow rollback.");
        return;
      }
      if (!window.confirm(`Rollback deployment ${item.namespace}/${item.name}?`)) {
        return;
      }
      setIsActing(true);
      try {
        const response = await api.rollbackResource("deployments", item.namespace, item.name);
        setMessage(response.message);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to rollback deployment");
      } finally {
        setIsActing(false);
      }
    },
    [canWrite, load],
  );

  return (
    <div className="space-y-5">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">Deployments</h2>
          <p className="text-sm text-zinc-400 mt-1">Specialized rollout controls with detail and YAML workflows.</p>
        </div>
        <div className="flex gap-2">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search deployments" className="field w-72" />
          <select value={namespaceFilter} onChange={(event) => setNamespaceFilter(event.target.value)} className="field">
            <option value="All">All namespaces</option>
            {namespaces.map((namespace) => (
              <option key={namespace} value={namespace}>
                {namespace}
              </option>
            ))}
          </select>
          <button onClick={() => void load()} disabled={isLoading || isActing || !canRead} className="btn">
            {isLoading ? "Loading" : "Refresh"}
          </button>
        </div>
      </header>

      {message && <div className="rounded-xl border border-[#2496ed]/40 bg-[#2496ed]/12 px-3 py-2 text-sm text-zinc-100">{message}</div>}
      {error && <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">{error}</div>}

      <div className="table-shell">
        <table className="min-w-full text-left text-sm">
          <thead className="table-head table-head-sticky">
            <tr>
              <th className="px-4 py-3 font-semibold">Deployment</th>
              <th className="px-4 py-3 font-semibold">Namespace</th>
              <th className="px-4 py-3 font-semibold">Rollout Status</th>
              <th className="px-4 py-3 font-semibold">Age</th>
              <th className="px-4 py-3 font-semibold">Summary</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 text-zinc-200">
            {filtered.map((item) => (
              <tr key={item.id} className="table-row">
                <td className="px-4 py-3">
                  <button onClick={() => void openDetail(item)} className="font-medium hover:underline">
                    {item.name}
                  </button>
                </td>
                <td className="px-4 py-3 text-zinc-400">{item.namespace ?? "-"}</td>
                <td className="px-4 py-3">{item.status}</td>
                <td className="px-4 py-3 text-zinc-400">{item.age}</td>
                <td className="px-4 py-3 text-zinc-400">{item.summary || "-"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setScaleTarget(item)} disabled={!canWrite || isActing} className="btn-sm border-zinc-600">
                      Scale
                    </button>
                    <button onClick={() => void restart(item)} disabled={!canWrite || isActing} className="btn-sm border-zinc-600">
                      Restart
                    </button>
                    <button onClick={() => void rollback(item)} disabled={!canWrite || isActing} className="btn-sm border-zinc-600">
                      Rollback
                    </button>
                    <button onClick={() => void openYAMLEditor(item)} disabled={!canWrite || isActing} className="btn-sm border-zinc-600">
                      YAML
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!isLoading && filtered.length === 0 && <p className="px-4 py-8 text-center text-sm text-zinc-500">No deployments match the current filters.</p>}
      </div>

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-6xl app-shell">
            <header className="border-b border-zinc-700 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-100">Deployment Detail</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {detail.target.namespace}/{detail.target.name}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="btn-sm border-zinc-600">
                Close
              </button>
            </header>
            <div className="p-4 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
              <div className="space-y-2">
                <InfoRow label="Rollout" value={detail.target.status} />
                <InfoRow label="Age" value={detail.target.age} />
                <InfoRow label="Summary" value={detail.target.summary || "n/a"} />
              </div>
              <pre className="max-h-[65vh] overflow-auto rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-200">{detail.yaml}</pre>
            </div>
          </div>
        </div>
      )}

      {yamlEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-6xl app-shell">
            <header className="border-b border-zinc-700 px-4 py-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-100">
                Edit YAML: {yamlEditor.target.namespace}/{yamlEditor.target.name}
              </p>
              <button onClick={() => setYAMLEditor(null)} className="btn-sm border-zinc-600">
                Close
              </button>
            </header>
            <div className="p-4">
              <textarea
                value={yamlEditor.yaml}
                onChange={(event) => setYAMLEditor((state) => (state ? { ...state, yaml: event.target.value } : null))}
                className="h-[60vh] w-full rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs font-mono text-zinc-100"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setYAMLEditor(null)} className="btn-sm border-zinc-600">
                  Cancel
                </button>
                <button onClick={() => void applyYAML()} disabled={!canWrite || isActing} className="btn-primary h-auto py-1.5 text-xs">
                  {isActing ? "Applying" : "Apply"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {scaleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md app-shell">
            <header className="border-b border-zinc-700 px-4 py-3">
              <p className="text-sm font-semibold text-zinc-100">Scale Deployment</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {scaleTarget.namespace}/{scaleTarget.name}
              </p>
            </header>
            <div className="p-4 space-y-3">
              <label className="text-xs text-zinc-400">
                Replicas
                <input value={scaleReplicas} onChange={(event) => setScaleReplicas(event.target.value)} type="number" min={0} className="field mt-1 w-full" />
              </label>
              <div className="flex justify-end gap-2">
                <button onClick={() => setScaleTarget(null)} className="btn-sm border-zinc-600">
                  Cancel
                </button>
                <button onClick={() => void scale()} disabled={!canWrite || isActing} className="btn-primary h-auto py-1.5 text-xs">
                  {isActing ? "Scaling" : "Scale"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200">
      <span className="text-zinc-500">{label}:</span> {value}
    </p>
  );
}

