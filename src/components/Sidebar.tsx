import { useEffect, useMemo, useState } from "react";
import { VIEW_SECTIONS, type ViewSection } from "../features/viewCatalog";
import { ApiError, api } from "../lib/api";
import type { BuildInfo, ClusterStats, View } from "../types";

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  sections?: ViewSection[];
}

export default function Sidebar({ currentView, onViewChange, sections = VIEW_SECTIONS }: SidebarProps) {
  const [isReal, setIsReal] = useState(false);
  const [stats, setStats] = useState<ClusterStats | null>(null);
  const [build, setBuild] = useState<BuildInfo | null>(null);
  const [backendLegacy, setBackendLegacy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([api.getClusterInfo(), api.getStats(), api.getVersion()])
      .then(([clusterResult, statsResult, versionResult]) => {
        if (cancelled) {
          return;
        }

        if (clusterResult.status === "fulfilled") {
          setIsReal(clusterResult.value.isRealCluster);
        } else {
          setIsReal(false);
        }

        if (statsResult.status === "fulfilled") {
          setStats(statsResult.value);
        }

        if (versionResult.status === "fulfilled") {
          setBuild(versionResult.value);
          setBackendLegacy(false);
        } else {
          const err = versionResult.reason;
          setBuild(null);
          setBackendLegacy(err instanceof ApiError && err.status === 404);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsReal(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const clusterPills = useMemo(
    () => [
      { label: "Pods", value: String(stats?.pods.total ?? 0) },
      { label: "Nodes", value: String(stats?.nodes.total ?? 0) },
      { label: "Ready", value: String(stats?.nodes.ready ?? 0) },
    ],
    [stats],
  );

  return (
    <aside className="w-80 h-screen p-4 pr-3">
      <div className="app-shell h-full flex flex-col overflow-hidden">
        <header className="px-5 py-5 border-b border-zinc-700">
          <p className="text-[11px] uppercase tracking-[0.22em] text-zinc-400 font-semibold">Kubernetes Ops</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-100 tracking-tight">Cluster Control Console</h1>
          <div className="mt-4 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${isReal ? "bg-[#2496ed]" : "bg-zinc-500"}`} />
            <span className="text-xs font-medium text-zinc-400">
              {isReal ? "Live cluster connection" : "Mock runtime mode"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {clusterPills.map((pill) => (
              <div key={pill.label} className="rounded-xl border border-zinc-700 bg-zinc-800/70 px-2 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-zinc-400">{pill.label}</p>
                <p className="text-sm font-semibold text-zinc-100 mt-0.5">{pill.value}</p>
              </div>
            ))}
          </div>
        </header>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-hide">
          {sections.map((section) => (
            <section key={section.id}>
              <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                {section.label}
              </p>
              <div className="space-y-1.5">
                {section.items.map((item) => {
                  const active = item.id === currentView;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onViewChange(item.id)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                        active
                          ? "border-[#2496ed] bg-[#2496ed]/16 text-zinc-100"
                          : "border-transparent hover:border-zinc-700 hover:bg-zinc-800/70 text-zinc-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">{item.label}</p>
                        {item.id === "metrics" && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${active ? "bg-[#2496ed]/25 text-zinc-100" : "bg-zinc-700 text-zinc-300"}`}
                          >
                            Live
                          </span>
                        )}
                      </div>
                      <p className={`text-[11px] mt-1 leading-relaxed ${active ? "text-zinc-300" : "text-zinc-500"}`}>
                        {item.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <footer className="px-5 py-4 border-t border-zinc-700 bg-zinc-800/60">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500">Tip</p>
          <p className="text-xs text-zinc-300 mt-1">
            Press <span className="font-mono font-semibold">/</span> to focus search.
          </p>
          <div className="mt-3 rounded-lg border border-zinc-700 bg-zinc-900/70 px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">Backend Build</p>
            {build ? (
              <p className="mt-1 text-[11px] text-zinc-300 font-mono">
                {build.version} @ {shortCommit(build.commit)}
              </p>
            ) : backendLegacy ? (
              <p className="mt-1 text-[11px] text-[#eab308]">legacy backend detected</p>
            ) : (
              <p className="mt-1 text-[11px] text-zinc-500">unavailable</p>
            )}
          </div>
        </footer>
      </div>
    </aside>
  );
}

function shortCommit(commit: string): string {
  const trimmed = commit.trim();
  if (trimmed.length <= 8) {
    return trimmed;
  }
  return trimmed.slice(0, 8);
}
