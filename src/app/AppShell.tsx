import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import Sidebar from "../components/Sidebar";
import Dashboard from "../views/dashboard";
import { findViewByQuery, getViewItem } from "../features/viewCatalog";
import { api } from "../lib/api";
import { useAuthSession } from "../context/AuthSessionContext";
import type { View } from "../types";
import { HeaderBar } from "./components/HeaderBar";
import { WorkspacePanels } from "./components/WorkspacePanels";
import { ModeBanner } from "./components/ModeBanner";
import { useCurrentView } from "./hooks/useCurrentView";
import { useNotifications } from "./hooks/useNotifications";
import { useUserSettings } from "./hooks/useUserSettings";
import { useClusterContexts } from "./hooks/useClusterContexts";
import { useRuntimeStatus } from "./hooks/useRuntimeStatus";

const Metrics = lazy(() => import("../views/metrics"));
const Audit = lazy(() => import("../views/audit"));
const Pods = lazy(() => import("../views/pods"));
const Deployments = lazy(() => import("../views/deployments"));
const Nodes = lazy(() => import("../views/nodes"));
const Diagnostics = lazy(() => import("../views/diagnostics"));
const Predictions = lazy(() => import("../views/predictions"));
const OpsAssistant = lazy(() => import("../views/opsassistant"));
const Terminal = lazy(() => import("../views/terminal"));
const ResourceCatalog = lazy(() => import("../views/resourcecatalog"));

type Panel = "none" | "notifications" | "settings" | "profile";

const PRIMARY_VIEWS: Partial<Record<View, ReactElement>> = {
  overview: <Dashboard />,
  pods: (
    <Suspense fallback={<ViewLoadingState label="Loading pods..." />}>
      <Pods />
    </Suspense>
  ),
  deployments: (
    <Suspense fallback={<ViewLoadingState label="Loading deployments..." />}>
      <Deployments />
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
  audit: (
    <Suspense fallback={<ViewLoadingState label="Loading audit trail..." />}>
      <Audit />
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

export function AppShell() {
  const {
    session: authSession,
    isLoading: authLoading,
    can,
    login,
    logout,
    refresh: refreshSession,
  } = useAuthSession();
  const { currentView, setCurrentView } = useCurrentView();
  const { settings, setSettings } = useUserSettings();
  const [search, setSearch] = useState("");
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("none");
  const [authToken, setAuthToken] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [clusterRefreshKey, setClusterRefreshKey] = useState(0);
  const [isSwitchingCluster, setIsSwitchingCluster] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const canRead = can("read");
  const runtime = useRuntimeStatus({ authLoading, canRead });
  const { clusterContexts, setClusterContexts } = useClusterContexts({ authLoading, canRead });
  const { notifications, notificationError } = useNotifications({
    panel,
    authLoading,
    canRead,
    canStream: can("stream"),
  });

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
    if (authLoading) {
      return;
    }
    if (currentView === "terminal" && !can("terminal")) {
      setCurrentView("overview");
      setSearchMessage("Terminal access requires admin permission.");
      window.setTimeout(() => setSearchMessage(null), 1800);
    }
    if (currentView === "assistant" && !can("assist")) {
      setCurrentView("overview");
      setSearchMessage("Assistant access requires an authenticated session.");
      window.setTimeout(() => setSearchMessage(null), 1800);
    }
  }, [authLoading, can, currentView, setCurrentView]);

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

  const handleSelectCluster = async (nextCluster: string) => {
    if (!clusterContexts || nextCluster === clusterContexts.selected) {
      return;
    }
    setIsSwitchingCluster(true);
    try {
      const response = await api.selectCluster(nextCluster);
      setClusterContexts((current) =>
        current
          ? {
              ...current,
              selected: response.selected,
            }
          : current,
      );
      setClusterRefreshKey((value) => value + 1);
      setSearchMessage(`Switched to cluster: ${response.selected}`);
      window.setTimeout(() => setSearchMessage(null), 1500);
    } catch (err) {
      setSearchMessage(err instanceof Error ? err.message : "Failed to switch cluster");
      window.setTimeout(() => setSearchMessage(null), 1800);
    } finally {
      setIsSwitchingCluster(false);
    }
  };

  return (
    <div className={`flex h-screen text-zinc-100 ${settings.denseMode ? "text-[13px]" : "text-sm"}`}>
      <Sidebar key={`sidebar-${clusterRefreshKey}`} currentView={currentView} onViewChange={setCurrentView} />

      <main className="flex-1 flex flex-col overflow-hidden p-4 pl-0">
        <div className="app-shell flex-1 flex flex-col overflow-hidden">
          <HeaderBar
            currentViewMeta={currentViewMeta}
            clusterContexts={clusterContexts}
            runtime={runtime}
            isSwitchingCluster={isSwitchingCluster}
            search={search}
            onSearchChange={setSearch}
            onSearchSubmit={handleSearchSubmit}
            onSelectCluster={handleSelectCluster}
            onToggleNotifications={() => setPanel((value) => (value === "notifications" ? "none" : "notifications"))}
            onToggleSettings={() => setPanel((value) => (value === "settings" ? "none" : "settings"))}
            onToggleProfile={() => setPanel((value) => (value === "profile" ? "none" : "profile"))}
            searchRef={searchRef}
          />

          <ModeBanner runtime={runtime} />

          {searchMessage && (
            <div className="px-6 py-2 bg-[#2496ed]/16 text-zinc-100 text-xs tracking-wide border-b border-[#2496ed]/30">
              {searchMessage}
            </div>
          )}

          <div key={`view-${clusterRefreshKey}`} className="flex-1 overflow-y-auto p-6 bg-grid">
            {renderedView}
          </div>

          <WorkspacePanels
            panel={panel}
            notifications={notifications}
            notificationError={notificationError}
            settings={settings}
            setSettings={setSettings}
            authSession={authSession}
            authLoading={authLoading}
            authToken={authToken}
            setAuthToken={setAuthToken}
            authMessage={authMessage}
            onAuthMessage={setAuthMessage}
            login={login}
            logout={logout}
            refreshSession={refreshSession}
            currentCommand={currentViewMeta.kubectlCommand}
          />
        </div>
      </main>
    </div>
  );
}

function ViewLoadingState({ label }: { label: string }) {
  return <div className="surface p-6 text-sm text-zinc-300">{label}</div>;
}
