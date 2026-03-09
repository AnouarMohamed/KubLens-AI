import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import Sidebar from "../components/Sidebar";
import { getViewItem } from "../features/viewCatalog";
import { useAuthSession } from "../context/AuthSessionContext";
import { HeaderBar } from "./components/HeaderBar";
import { WorkspacePanels } from "./components/WorkspacePanels";
import { useCurrentView } from "./hooks/useCurrentView";
import { useNotifications } from "./hooks/useNotifications";
import { useUserSettings } from "./hooks/useUserSettings";
import { useClusterContexts } from "./hooks/useClusterContexts";
import { useRuntimeStatus } from "./hooks/useRuntimeStatus";
import { useClusterSwitcher } from "./hooks/useClusterSwitcher";
import { useSearchNavigation } from "./hooks/useSearchNavigation";
import { blockedViewMessage, useViewAccess } from "./hooks/useViewAccess";
import { useTransientMessage } from "./hooks/useTransientMessage";
import type { View } from "../types";
import Dashboard from "../views/dashboard";

const Metrics = lazy(() => import("../views/metrics"));
const Audit = lazy(() => import("../views/audit"));
const Pods = lazy(() => import("../views/pods"));
const Deployments = lazy(() => import("../views/deployments"));
const Nodes = lazy(() => import("../views/nodes"));
const Events = lazy(() => import("../views/events"));
const Namespaces = lazy(() => import("../views/namespaces"));
const RBAC = lazy(() => import("../views/rbac"));
const Diagnostics = lazy(() => import("../views/diagnostics"));
const Predictions = lazy(() => import("../views/predictions"));
const OpsAssistant = lazy(() => import("../views/opsassistant"));
const ResourceCatalog = lazy(() => import("../views/resourcecatalog"));

type Panel = "none" | "notifications" | "settings" | "profile";

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
  const [panel, setPanel] = useState<Panel>("none");
  const [authToken, setAuthToken] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
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

  const { message: transientMessage, showMessage } = useTransientMessage();
  const { sections, searchableItems, isAllowed } = useViewAccess({
    canAssist: can("assist"),
  });
  const { search, setSearch, submitSearch } = useSearchNavigation({
    items: searchableItems,
    setCurrentView,
    onMessage: (message) => showMessage(message, 1500),
  });
  const { clusterRefreshKey, isSwitchingCluster, selectCluster } = useClusterSwitcher({
    clusterContexts,
    setClusterContexts,
    onMessage: (message) => showMessage(message, 1800),
  });

  const currentViewMeta = getViewItem(currentView);
  const renderedView = useMemo(() => renderView(currentView), [currentView]);

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
    if (!isAllowed(currentView)) {
      setCurrentView("overview");
      showMessage(blockedViewMessage(currentView), 1800);
    }
  }, [authLoading, currentView, isAllowed, setCurrentView, showMessage]);

  return (
    <div className={`flex h-screen text-zinc-100 ${settings.denseMode ? "text-[13px]" : "text-sm"}`}>
      <Sidebar
        key={`sidebar-${clusterRefreshKey}`}
        currentView={currentView}
        onViewChange={setCurrentView}
        sections={sections}
      />

      <main className="flex-1 flex flex-col overflow-hidden p-4 pl-0">
        <div className="app-shell relative flex-1 flex flex-col overflow-hidden">
          <HeaderBar
            currentViewMeta={currentViewMeta}
            clusterContexts={clusterContexts}
            runtime={runtime}
            isSwitchingCluster={isSwitchingCluster}
            search={search}
            onSearchChange={setSearch}
            onSearchSubmit={submitSearch}
            onSelectCluster={selectCluster}
            onToggleNotifications={() => setPanel((value) => (value === "notifications" ? "none" : "notifications"))}
            onToggleSettings={() => setPanel((value) => (value === "settings" ? "none" : "settings"))}
            onToggleProfile={() => setPanel((value) => (value === "profile" ? "none" : "profile"))}
            searchRef={searchRef}
          />

          {transientMessage && (
            <div className="px-6 py-2 bg-[var(--accent-dim)] text-zinc-100 text-xs tracking-wide border-b border-zinc-700">
              {transientMessage}
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

function renderView(view: View): ReactElement {
  switch (view) {
    case "overview":
      return <Dashboard />;
    case "pods":
      return (
        <Suspense fallback={<ViewLoadingState label="Loading pods..." />}>
          <Pods />
        </Suspense>
      );
    case "deployments":
      return (
        <Suspense fallback={<ViewLoadingState label="Loading deployments..." />}>
          <Deployments />
        </Suspense>
      );
    case "nodes":
      return (
        <Suspense fallback={<ViewLoadingState label="Loading nodes..." />}>
          <Nodes />
        </Suspense>
      );
    case "events":
      return (
        <Suspense fallback={<ViewLoadingState label="Loading events..." />}>
          <Events />
        </Suspense>
      );
    case "namespaces":
      return (
        <Suspense fallback={<ViewLoadingState label="Loading namespaces..." />}>
          <Namespaces />
        </Suspense>
      );
    case "rbac":
      return (
        <Suspense fallback={<ViewLoadingState label="Loading RBAC..." />}>
          <RBAC />
        </Suspense>
      );
    case "metrics":
      return (
        <Suspense fallback={<ViewLoadingState label="Loading metrics..." />}>
          <Metrics />
        </Suspense>
      );
    case "audit":
      return (
        <Suspense fallback={<ViewLoadingState label="Loading audit trail..." />}>
          <Audit />
        </Suspense>
      );
    case "predictions":
      return (
        <Suspense fallback={<ViewLoadingState label="Loading predictions..." />}>
          <Predictions />
        </Suspense>
      );
    case "diagnostics":
      return (
        <Suspense fallback={<ViewLoadingState label="Loading diagnostics..." />}>
          <Diagnostics />
        </Suspense>
      );
    case "assistant":
      return (
        <Suspense fallback={<ViewLoadingState label="Loading assistant..." />}>
          <OpsAssistant />
        </Suspense>
      );
    default:
      return (
        <Suspense fallback={<ViewLoadingState label="Loading resources..." />}>
          <ResourceCatalog view={view} />
        </Suspense>
      );
  }
}

function ViewLoadingState({ label }: { label: string }) {
  return <div className="surface p-6 text-sm text-zinc-300">{label}</div>;
}
