/**
 * View-access policy hook for feature-gated navigation state.
 */
import { useMemo } from "react";
import {
  VIEW_SECTIONS,
  filterSectionsByPolicy,
  flattenViewItems,
  isViewVisible,
  type ViewAccessPolicy,
} from "../../features/viewCatalog";
import type { View } from "../../types";

interface UseViewAccessInput {
  canAssist: boolean;
}

/**
 * Resolves visible sections and guard helpers from session permissions.
 *
 * @param input - Permission flags derived from the auth session.
 * @returns Visibility policy, filtered sections, search candidates, and guard.
 */
export function useViewAccess({ canAssist }: UseViewAccessInput) {
  const policy = useMemo<ViewAccessPolicy>(
    () => ({
      assistantEnabled: canAssist,
    }),
    [canAssist],
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

/**
 * Returns a user-facing message for blocked-view redirects.
 *
 * @param view - View that was blocked.
 * @returns Friendly explanatory message.
 */
export function blockedViewMessage(view: View): string {
  if (view === "assistant") {
    return "Assistant access requires an authenticated session.";
  }
  return "This view is not available in the current session.";
}
