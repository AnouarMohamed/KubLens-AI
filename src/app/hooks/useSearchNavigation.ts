/**
 * Search-driven navigation hook for opening views by name or identifier.
 */
import { useState } from "react";
import { findViewByQuery, type ViewItem } from "../../features/viewCatalog";
import type { View } from "../../types";

/**
 * Input contract for {@link useSearchNavigation}.
 */
interface UseSearchNavigationInput {
  items: ViewItem[];
  setCurrentView: (view: View) => void;
  onMessage: (message: string) => void;
}

/**
 * Manages search text and resolves it to a view navigation action.
 *
 * @param input - Search candidates and navigation side effects.
 * @returns Search state and submit handler.
 */
export function useSearchNavigation({ items, setCurrentView, onMessage }: UseSearchNavigationInput) {
  const [search, setSearch] = useState("");

  const submitSearch = () => {
    const found = findViewByQuery(search, items);
    if (!found) {
      onMessage("No matching section found.");
      return;
    }

    setCurrentView(found.id);
    setSearch("");
    onMessage(`Opened ${found.label}.`);
  };

  return {
    search,
    setSearch,
    submitSearch,
  };
}
