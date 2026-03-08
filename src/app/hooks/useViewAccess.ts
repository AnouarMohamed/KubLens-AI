import { useMemo } from "react";
import {
  VIEW_SECTIONS,
  filterSectionsByPolicy,
  flattenViewItems,
  isViewVisible,
  type ViewAccessPolicy,
} from "../../features/viewCatalog";
import type { RuntimeStatus, View } from "../../types";

interface UseViewAccessInput {
  canTerminal: boolean;
  canAssist: boolean;
  runtime: RuntimeStatus | null;
}

export function useViewAccess({ canTerminal, canAssist, runtime }: UseViewAccessInput) {
  const policy = useMemo<ViewAccessPolicy>(
    () => ({
      assistantEnabled: canAssist,
      terminalEnabled: canTerminal && (runtime?.terminalEnabled ?? false),
    }),
    [canAssist, canTerminal, runtime?.terminalEnabled],
  );

  const sections = useMemo(() => filterSectionsByPolicy(VIEW_SECTIONS, policy), [policy]);
  const searchableItems = useMemo(() => flattenViewItems(sections), [sections]);

  const isAllowed = (view: View) => isViewVisible(view, policy);

  return {
    policy,
    sections,
    searchableItems,
    isAllowed,
  };
}

export function blockedViewMessage(view: View, runtime: RuntimeStatus | null): string {
  if (view === "terminal") {
    if (!runtime?.terminalEnabled) {
      return "Terminal is disabled in this environment.";
    }
    return "Terminal access requires admin permission.";
  }
  if (view === "assistant") {
    return "Assistant access requires an authenticated session.";
  }
  return "This view is not available in the current session.";
}
