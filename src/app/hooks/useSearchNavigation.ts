import { useState } from "react";
import { findViewByQuery, type ViewItem } from "../../features/viewCatalog";
import type { View } from "../../types";

interface UseSearchNavigationInput {
  items: ViewItem[];
  setCurrentView: (view: View) => void;
  onMessage: (message: string) => void;
}

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
