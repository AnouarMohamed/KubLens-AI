import { useCallback, useEffect, useMemo, useState } from "react";
import { getViewItem } from "../../features/viewCatalog";
import { api } from "../../lib/api";
import { useAuthSession } from "../../context/AuthSessionContext";
import type { ResourceRecord, View } from "../../types";
import { ResourceCatalogSummary } from "./components/ResourceCatalogSummary";

const SCALEABLE_VIEWS = new Set<View>(["deployments", "statefulsets", "jobs"]);
const RESTARTABLE_VIEWS = new Set<View>(["deployments", "statefulsets", "jobs"]);
const ROLLBACK_VIEWS = new Set<View>(["deployments"]);

export default function ResourceCatalog({ view }: { view: View }) {
  const { can, isLoading: authLoading } = useAuthSession();
  const meta = getViewItem(view);
  const [resources, setResources] = useState<ResourceRecord[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canRead = can("read");
  const canWrite = can("write");

  const [yamlTarget, setYAMLTarget] = useState<ResourceRecord | null>(null);
  const [yamlText, setYAMLText] = useState("");

  const [scaleTarget, setScaleTarget] = useState<ResourceRecord | null>(null);
  const [scaleReplicas, setScaleReplicas] = useState("1");

  const load = useCallback(async () => {
    if (!canRead) {
      setResources([]);
      setError("Authenticate to view resource data.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.getResources(view);
      setResources(response.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load resources");
    } finally {
      setIsLoading(false);
    }
  }, [canRead, view]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    void load();
  }, [authLoading, load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query === "") {
      return resources;
    }

    return resources.filter((resource) => {
      const haystack =
        `${resource.name} ${resource.namespace ?? ""} ${resource.status} ${resource.summary ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [resources, search]);

  const hasWorkloadActions = SCALEABLE_VIEWS.has(view) || RESTARTABLE_VIEWS.has(view) || ROLLBACK_VIEWS.has(view);

  const openYAMLEditor = useCallback(
    async (resource: ResourceRecord) => {
      if (!canWrite) {
        setError("Your role does not allow YAML actions.");
        return;
      }
      if (!resource.namespace) {
        setError("YAML actions require a namespaced resource");
        return;
      }

      setIsActing(true);
      try {
        const response = await api.getResourceYAML(view, resource.namespace, resource.name);
        setYAMLTarget(resource);
        setYAMLText(response.yaml);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load YAML");
      } finally {
        setIsActing(false);
      }
    },
    [canWrite, view],
  );

  const applyYAML = useCallback(async () => {
    if (!canWrite) {
      setError("Your role does not allow YAML actions.");
      return;
    }
    if (!yamlTarget || !yamlTarget.namespace) {
      return;
    }

    setIsActing(true);
    try {
      const response = await api.applyResourceYAML(view, yamlTarget.namespace, yamlTarget.name, { yaml: yamlText });
      setMessage(response.message);
      setYAMLTarget(null);
      setYAMLText("");
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply YAML");
    } finally {
      setIsActing(false);
    }
  }, [canWrite, load, view, yamlTarget, yamlText]);

  const openScaleEditor = useCallback(
    (resource: ResourceRecord) => {
      if (!canWrite) {
        setError("Your role does not allow scaling actions.");
        return;
      }
      if (!resource.namespace) {
        return;
      }

      setScaleTarget(resource);
      setScaleReplicas(String(extractReplicas(resource.status)));
    },
    [canWrite],
  );

  const applyScale = useCallback(async () => {
    if (!canWrite) {
      setError("Your role does not allow scaling actions.");
      return;
    }
    if (!scaleTarget || !scaleTarget.namespace) {
      return;
    }

    const replicas = Number.parseInt(scaleReplicas, 10);
    if (!Number.isFinite(replicas) || replicas < 0) {
      setError("Replicas must be a positive integer or zero");
      return;
    }

    setIsActing(true);
    try {
      const response = await api.scaleResource(view, scaleTarget.namespace, scaleTarget.name, { replicas });
      setMessage(response.message);
      setScaleTarget(null);
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scale resource");
    } finally {
      setIsActing(false);
    }
  }, [canWrite, load, scaleReplicas, scaleTarget, view]);

  const restartResource = useCallback(
    async (resource: ResourceRecord) => {
      if (!canWrite) {
        setError("Your role does not allow restart actions.");
        return;
      }
      if (!resource.namespace) {
        return;
      }
      if (!window.confirm(`Restart ${view.slice(0, -1)} ${resource.namespace}/${resource.name}?`)) {
        return;
      }

      setIsActing(true);
      try {
        const response = await api.restartResource(view, resource.namespace, resource.name);
        setMessage(response.message);
        setError(null);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to restart resource");
      } finally {
        setIsActing(false);
      }
    },
    [canWrite, load, view],
  );

  const rollbackResource = useCallback(
    async (resource: ResourceRecord) => {
      if (!canWrite) {
        setError("Your role does not allow rollback actions.");
        return;
      }
      if (!resource.namespace) {
        return;
      }
      if (!window.confirm(`Rollback deployment ${resource.namespace}/${resource.name}?`)) {
        return;
      }

      setIsActing(true);
      try {
        const response = await api.rollbackResource(view, resource.namespace, resource.name);
        setMessage(response.message);
        setError(null);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to rollback resource");
      } finally {
        setIsActing(false);
      }
    },
    [canWrite, load, view],
  );

  return (
    <div className="space-y-5">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">{meta.label}</h2>
          <p className="text-sm text-zinc-400 mt-1">{meta.description}</p>
        </div>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            className="field w-72"
          />
          <button onClick={() => void load()} disabled={isLoading || isActing || !canRead} className="btn">
            {isLoading ? "Loading" : "Refresh"}
          </button>
        </div>
      </header>

      {message && (
        <div className="rounded-xl border border-[#00d4a8]/40 bg-[#00d4a8]/12 px-3 py-2 text-sm text-zinc-100">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">{error}</div>
      )}

      <ResourceCatalogSummary resources={resources} filteredCount={filtered.length} />

      <div className="table-shell">
        <table className="min-w-full text-left">
          <thead className="table-head table-head-sticky">
            <tr>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Namespace</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Age</th>
              <th className="px-4 py-3 font-semibold">Summary</th>
              {hasWorkloadActions && <th className="px-4 py-3 font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 text-sm text-zinc-200">
            {filtered.map((resource) => (
              <tr key={resource.id} className="table-row">
                <td className="px-4 py-3 font-medium">{resource.name}</td>
                <td className="px-4 py-3 text-zinc-400">{resource.namespace || "-"}</td>
                <td className="px-4 py-3">{resource.status}</td>
                <td className="px-4 py-3 text-zinc-400">{resource.age}</td>
                <td className="px-4 py-3 text-zinc-400">{resource.summary || "-"}</td>
                {hasWorkloadActions && (
                  <td className="px-4 py-3">
                    {resource.namespace ? (
                      <div className="flex flex-wrap gap-2">
                        <ActionButton
                          onClick={() => void openYAMLEditor(resource)}
                          disabled={isActing || !canWrite}
                          label="Edit YAML"
                        />
                        {SCALEABLE_VIEWS.has(view) && (
                          <ActionButton
                            onClick={() => openScaleEditor(resource)}
                            disabled={isActing || !canWrite}
                            label="Scale"
                          />
                        )}
                        {RESTARTABLE_VIEWS.has(view) && (
                          <ActionButton
                            onClick={() => void restartResource(resource)}
                            disabled={isActing || !canWrite}
                            label="Restart"
                          />
                        )}
                        {ROLLBACK_VIEWS.has(view) && (
                          <button
                            onClick={() => void rollbackResource(resource)}
                            disabled={isActing || !canWrite}
                            className="btn-sm border-zinc-600"
                          >
                            Rollback
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-500">Not available</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {!isLoading && filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">No resources found.</p>
        )}
      </div>

      {yamlTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-5xl app-shell">
            <header className="border-b border-zinc-700 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-zinc-100">Edit YAML</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {view}: {yamlTarget.namespace}/{yamlTarget.name}
                </p>
              </div>
              <button onClick={() => setYAMLTarget(null)} className="btn-sm border-zinc-600">
                Close
              </button>
            </header>
            <div className="p-4">
              <textarea
                value={yamlText}
                onChange={(event) => setYAMLText(event.target.value)}
                className="h-[60vh] w-full rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs font-mono text-zinc-100"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setYAMLTarget(null)} className="btn-sm border-zinc-600">
                  Cancel
                </button>
                <button
                  onClick={() => void applyYAML()}
                  disabled={isActing || !canWrite}
                  className="btn-primary h-auto py-1.5 text-xs"
                >
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
              <p className="text-sm font-semibold text-zinc-100">Scale Resource</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                {view}: {scaleTarget.namespace}/{scaleTarget.name}
              </p>
            </header>
            <div className="p-4 space-y-3">
              <label className="text-xs text-zinc-400">
                Replicas
                <input
                  value={scaleReplicas}
                  onChange={(event) => setScaleReplicas(event.target.value)}
                  type="number"
                  min={0}
                  className="field mt-1 w-full"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button onClick={() => setScaleTarget(null)} className="btn-sm border-zinc-600">
                  Cancel
                </button>
                <button
                  onClick={() => void applyScale()}
                  disabled={isActing || !canWrite}
                  className="btn-primary h-auto py-1.5 text-xs"
                >
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

function ActionButton({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className="btn-sm border-zinc-600">
      {label}
    </button>
  );
}

function extractReplicas(status: string): number {
  const readyMatch = status.match(/^(\d+)\/(\d+)\s+Ready$/i);
  if (readyMatch) {
    return Number.parseInt(readyMatch[2], 10);
  }

  const parallelismMatch = status.match(/parallelism:\s*(\d+)/i);
  if (parallelismMatch) {
    return Number.parseInt(parallelismMatch[1], 10);
  }

  return 1;
}
