import { useEffect, useState } from "react";
import type { View } from "../../types";

const VIEW_KEY = "k8s-ops.current-view.v1";

const VALID_VIEWS = new Set<View>([
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
  "audit",
  "predictions",
  "diagnostics",
  "assistant",
]);

function loadLastView(): View {
  try {
    const raw = window.localStorage.getItem(VIEW_KEY);
    if (raw && VALID_VIEWS.has(raw as View)) {
      return raw as View;
    }
  } catch {
    // no-op
  }
  return "overview";
}

export function useCurrentView() {
  const [currentView, setCurrentView] = useState<View>(loadLastView);

  useEffect(() => {
    window.localStorage.setItem(VIEW_KEY, currentView);
  }, [currentView]);

  return { currentView, setCurrentView };
}
