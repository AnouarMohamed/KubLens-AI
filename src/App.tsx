import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import Sidebar from "./components/Sidebar";
import Dashboard from "./views/dashboard";
import { findViewByQuery, getViewItem } from "./features/viewCatalog";
import { api } from "./lib/api";
import type { K8sEvent, View } from "./types";

const Metrics = lazy(() => import("./views/metrics"));
const Pods = lazy(() => import("./views/pods"));
const Nodes = lazy(() => import("./views/nodes"));
const Diagnostics = lazy(() => import("./views/diagnostics"));
const Predictions = lazy(() => import("./views/predictions"));
const OpsAssistant = lazy(() => import("./views/opsassistant"));
const Terminal = lazy(() => import("./views/terminal"));
const ResourceCatalog = lazy(() => import("./views/resourcecatalog"));

const PRIMARY_VIEWS: Partial<Record<View, ReactElement>> = {
  overview: <Dashboard />,
  pods: (
    <Suspense fallback={<ViewLoadingState label="Loading pods..." />}>
      <Pods />
    </Suspense>
  ),
  nodes: (
    <Suspense fallback={<ViewLoadingState label="Loading nodes..." />}>
      <Nodes />
    </Suspense>
  ),
  metrics: (
    <Suspense fallback={<ViewLoadingState label="Loading metrics..." />}>
      <Metrics />
    </Suspense>
  ),
  predictions: (
    <Suspense fallback={<ViewLoadingState label="Loading predictions..." />}>
      <Predictions />
    </Suspense>
  ),
  diagnostics: (
    <Suspense fallback={<ViewLoadingState label="Loading diagnostics..." />}>
      <Diagnostics />
    </Suspense>
  ),
  terminal: (
    <Suspense fallback={<ViewLoadingState label="Loading terminal..." />}>
      <Terminal />
    </Suspense>
  ),
  assistant: (
    <Suspense fallback={<ViewLoadingState label="Loading assistant..." />}>
      <OpsAssistant />
    </Suspense>
  ),
};

const SETTINGS_KEY = "k8s-ops.settings.v1";
const VIEW_KEY = "k8s-ops.current-view.v1";

type Panel = "none" | "notifications" | "settings" | "profile";

interface UserSettings {
  denseMode: boolean;
  autoRefreshSeconds: number;
}

const DEFAULT_SETTINGS: UserSettings = {
  denseMode: false,
  autoRefreshSeconds: 30,
};

function loadSettings(): UserSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      denseMode: parsed.denseMode ?? DEFAULT_SETTINGS.denseMode,
      autoRefreshSeconds: parsed.autoRefreshSeconds ?? DEFAULT_SETTINGS.autoRefreshSeconds,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadLastView(): View {
  try {
    const raw = window.localStorage.getItem(VIEW_KEY);
    if (!raw) {
      return "overview";
    }

    const validViews = new Set<View>([
      "overview",
      "pods",
      "deployments",
      "replicasets",
      "statefulsets",
      "daemonsets",
      "jobs",
      "cronjobs",
      "services",
      "ingresses",
      "networkpolicies",
      "configmaps",
      "secrets",
      "persistentvolumes",
      "persistentvolumeclaims",
      "storageclasses",
      "nodes",
      "namespaces",
      "events",
      "serviceaccounts",
      "rbac",
      "metrics",
      "predictions",
      "diagnostics",
      "terminal",
      "assistant",
    ]);

    if (validViews.has(raw as View)) {
      return raw as View;
    }
  } catch {
    // no-op
  }

  return "overview";
}

export default function App() {
  const [currentView, setCurrentView] = useState<View>(loadLastView);
  const [search, setSearch] = useState("");
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("none");
  const [notifications, setNotifications] = useState<K8sEvent[]>([]);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings>(loadSettings);
  const searchRef = useRef<HTMLInputElement>(null);

  const currentViewMeta = getViewItem(currentView);

  const renderedView = useMemo(
    () =>
      PRIMARY_VIEWS[currentView] ?? (
        <Suspense fallback={<ViewLoadingState label="Loading resources..." />}>
          <ResourceCatalog view={currentView} />
        </Suspense>
      ),
    [currentView],
  );

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    window.localStorage.setItem(VIEW_KEY, currentView);
  }, [currentView]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement !== searchRef.current) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (event.key === "Escape") {
        setPanel("none");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (panel !== "notifications") {
      return;
    }

    let cancelled = false;
    api
      .getEvents()
      .then((rows) => {
        if (!cancelled) {
          setNotifications(rows.slice(0, 14));
          setNotificationError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setNotificationError(err instanceof Error ? err.message : "Failed to load notifications");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [panel]);

  const handleSearchSubmit = () => {
    const found = findViewByQuery(search);
    if (!found) {
      setSearchMessage("No matching section found.");
      window.setTimeout(() => setSearchMessage(null), 1500);
      return;
    }

    setCurrentView(found.id);
    setSearch("");
    setSearchMessage(`Opened ${found.label}.`);
    window.setTimeout(() => setSearchMessage(null), 1500);
  };

  return (
    <div className={`flex h-screen text-zinc-100 ${settings.denseMode ? "text-[13px]" : "text-sm"}`}>
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />

      <main className="flex-1 flex flex-col overflow-hidden p-4 pl-0">
        <div className="app-shell flex-1 flex flex-col overflow-hidden">
          <header className="h-16 border-b border-zinc-700 flex items-center justify-between px-6 bg-zinc-900/92">
            <div>
              <h2 className="text-base font-semibold text-zinc-100 tracking-tight">{currentViewMeta.label}</h2>
              <p className="text-xs text-zinc-400 mt-0.5 font-mono">{currentViewMeta.kubectlCommand}</p>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleSearchSubmit()}
                placeholder="Search views ( / )"
                className="field w-72"
              />
              <TopButton onClick={handleSearchSubmit} label="Go" />
              <TopButton onClick={() => setPanel((value) => (value === "notifications" ? "none" : "notifications"))} label="Notifications" />
              <TopButton onClick={() => setPanel((value) => (value === "settings" ? "none" : "settings"))} label="Settings" />
              <TopButton onClick={() => setPanel((value) => (value === "profile" ? "none" : "profile"))} label="Profile" />
            </div>
          </header>

          {searchMessage && <div className="px-6 py-2 bg-[#2496ed]/16 text-zinc-100 text-xs tracking-wide border-b border-[#2496ed]/30">{searchMessage}</div>}

          <div className="flex-1 overflow-y-auto p-6 bg-grid">{renderedView}</div>

          {panel !== "none" && (
            <aside className="absolute top-20 right-4 h-[calc(100%-6rem)] w-[30rem] app-shell overflow-hidden">
              {panel === "notifications" && (
                <PanelShell title="Notifications" subtitle="Event stream from cluster activity">
                  {notificationError && <p className="text-sm text-zinc-200">{notificationError}</p>}
                  {notifications.map((event, index) => (
                    <article key={`${event.reason}-${index}`} className="rounded-xl border border-zinc-700 bg-zinc-800/70 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-zinc-100">{event.reason}</p>
                        <p className="text-xs text-zinc-400">{event.age}</p>
                      </div>
                      <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{event.message}</p>
                    </article>
                  ))}
                  {!notificationError && notifications.length === 0 && <p className="text-sm text-zinc-400">No notifications available.</p>}
                </PanelShell>
              )}

              {panel === "settings" && (
                <PanelShell title="Settings" subtitle="Workspace behavior and density">
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2">
                    <span>Dense mode</span>
                    <input
                      type="checkbox"
                      checked={settings.denseMode}
                      onChange={(event) => setSettings((state) => ({ ...state, denseMode: event.target.checked }))}
                    />
                  </label>
                  <label className="block rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2">
                    Auto refresh (seconds)
                    <input
                      type="number"
                      min={10}
                      max={300}
                      value={settings.autoRefreshSeconds}
                      onChange={(event) =>
                        setSettings((state) => ({
                          ...state,
                          autoRefreshSeconds: Number.parseInt(event.target.value, 10) || DEFAULT_SETTINGS.autoRefreshSeconds,
                        }))
                      }
                      className="mt-2 h-10 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 text-sm text-zinc-100"
                    />
                  </label>
                </PanelShell>
              )}

              {panel === "profile" && (
                <PanelShell title="Profile" subtitle="Current operator identity">
                  <InfoRow label="User" value="Cluster Admin" />
                  <InfoRow label="Role" value="Platform Engineering" />
                  <InfoRow label="Session" value="Authenticated" />
                  <button
                    onClick={() => navigator.clipboard.writeText(currentViewMeta.kubectlCommand)}
                    className="rounded-xl border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
                  >
                    Copy Current Command
                  </button>
                </PanelShell>
              )}
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

function ViewLoadingState({ label }: { label: string }) {
  return <div className="surface p-6 text-sm text-zinc-300">{label}</div>;
}

function TopButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className="btn">
      {label}
    </button>
  );
}

function PanelShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col">
      <header className="px-4 py-3 border-b border-zinc-700 bg-zinc-800/80">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">{children}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2">
      <span className="font-semibold text-zinc-100">{label}:</span> <span className="text-zinc-300">{value}</span>
    </p>
  );
}
