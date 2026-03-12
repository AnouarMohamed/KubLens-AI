import { useCallback, useState } from "react";

export function useNodeSelection() {
  const [selectedNodeNames, setSelectedNodeNames] = useState<string[]>([]);

  const toggleNodeSelection = useCallback((name: string) => {
    setSelectedNodeNames((state) => (state.includes(name) ? state.filter((item) => item !== name) : [...state, name]));
  }, []);

  const toggleSelectAllVisible = useCallback((names: string[]) => {
    if (names.length === 0) {
      setSelectedNodeNames([]);
      return;
    }
    setSelectedNodeNames((state) => {
      const allSelected = names.every((name) => state.includes(name));
      if (allSelected) {
        return state.filter((name) => !names.includes(name));
      }
      const next = new Set(state);
      for (const name of names) {
        next.add(name);
      }
      return Array.from(next);
    });
  }, []);

  const clearNodeSelection = useCallback(() => {
    setSelectedNodeNames([]);
  }, []);

  return {
    selectedNodeNames,
    setSelectedNodeNames,
    toggleNodeSelection,
    toggleSelectAllVisible,
    clearNodeSelection,
  };
}
