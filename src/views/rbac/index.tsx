import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthSession } from "../../context/AuthSessionContext";
import { api } from "../../lib/api";
import type { ResourceRecord } from "../../types";

const KIND_FILTERS = ["All", "Role", "RoleBinding", "ClusterRole", "ClusterRoleBinding"] as const;

export default function RBAC() {
  const { can, isLoading: authLoading } = useAuthSession();
  const [items, setItems] = useState<ResourceRecord[]>([]);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<(typeof KIND_FILTERS)[number]>("All");
  const [namespaceFilter, setNamespaceFilter] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canRead = can("read");

  const load = useCallback(async () => {
    if (!canRead) {
      setItems([]);
      setError("Authenticate to view RBAC resources.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.getResources("rbac");
      setItems(response.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load RBAC resources");
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
    return Array.from(new Set(items.map((item) => item.namespace).filter((value) => value && value !== ""))).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesKind = kindFilter === "All" || item.status === kindFilter;
      const itemNamespace = item.namespace?.trim() || "Cluster";
      const matchesNamespace = namespaceFilter === "All" || namespaceFilter === itemNamespace;
      const matchesSearch =
        query === "" ||
        `${item.name} ${item.status} ${item.summary ?? ""} ${itemNamespace}`.toLowerCase().includes(query);
      return matchesKind && matchesNamespace && matchesSearch;
    });
  }, [items, kindFilter, namespaceFilter, search]);

  const counts = useMemo(() => {
    const byKind = new Map<string, number>();
    for (const item of items) {
      byKind.set(item.status, (byKind.get(item.status) ?? 0) + 1);
    }
    return {
      roles: byKind.get("Role") ?? 0,
      roleBindings: byKind.get("RoleBinding") ?? 0,
      clusterRoles: byKind.get("ClusterRole") ?? 0,
      clusterRoleBindings: byKind.get("ClusterRoleBinding") ?? 0,
    };
  }, [items]);

  return (
    <div className="space-y-5">
      <header className="panel-head">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">RBAC</h2>
          <p className="text-sm text-zinc-400 mt-1">Access control objects across namespace and cluster scope.</p>
        </div>
        <div className="flex gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search RBAC resources"
            className="field w-72"
          />
          <select
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value as (typeof KIND_FILTERS)[number])}
            className="field"
          >
            {KIND_FILTERS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
          <select
            value={namespaceFilter}
            onChange={(event) => setNamespaceFilter(event.target.value)}
            className="field"
          >
            <option value="All">All scopes</option>
            <option value="Cluster">Cluster scoped</option>
            {namespaces.map((namespace) => (
              <option key={namespace} value={namespace}>
                {namespace}
              </option>
            ))}
          </select>
          <button onClick={() => void load()} disabled={isLoading || !canRead} className="btn">
            {isLoading ? "Loading" : "Refresh"}
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Visible" value={String(filtered.length)} />
        <Kpi label="Roles" value={String(counts.roles)} />
        <Kpi label="RoleBindings" value={String(counts.roleBindings)} />
        <Kpi label="ClusterRoles" value={String(counts.clusterRoles)} />
        <Kpi label="ClusterRoleBindings" value={String(counts.clusterRoleBindings)} />
      </section>

      {error && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">{error}</div>
      )}

      <div className="table-shell">
        <table className="min-w-full text-left text-sm">
          <thead className="table-head table-head-sticky">
            <tr>
              <th className="px-4 py-3 font-semibold">Kind</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Namespace</th>
              <th className="px-4 py-3 font-semibold">Age</th>
              <th className="px-4 py-3 font-semibold">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 text-zinc-200">
            {filtered.map((item) => (
              <tr key={item.id} className="table-row">
                <td className="px-4 py-3 font-medium">{item.status}</td>
                <td className="px-4 py-3">{item.name}</td>
                <td className="px-4 py-3 text-zinc-400">{item.namespace || "Cluster"}</td>
                <td className="px-4 py-3 text-zinc-400">{item.age}</td>
                <td className="px-4 py-3 text-zinc-300">{item.summary || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {isLoading && <p className="px-4 py-8 text-center text-sm text-zinc-500">Loading RBAC resources...</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">No RBAC resources match the filters.</p>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <article className="kpi">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">{value}</p>
    </article>
  );
}
