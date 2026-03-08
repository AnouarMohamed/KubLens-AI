import { useState, type Dispatch, type SetStateAction } from "react";
import { api } from "../../lib/api";
import type { ClusterContextList } from "../../types";

interface UseClusterSwitcherInput {
  clusterContexts: ClusterContextList | null;
  setClusterContexts: Dispatch<SetStateAction<ClusterContextList | null>>;
  onMessage: (message: string) => void;
}

export function useClusterSwitcher({ clusterContexts, setClusterContexts, onMessage }: UseClusterSwitcherInput) {
  const [clusterRefreshKey, setClusterRefreshKey] = useState(0);
  const [isSwitchingCluster, setIsSwitchingCluster] = useState(false);

  const selectCluster = async (nextCluster: string) => {
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
      onMessage(`Switched to cluster: ${response.selected}`);
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Failed to switch cluster");
    } finally {
      setIsSwitchingCluster(false);
    }
  };

  return {
    clusterRefreshKey,
    isSwitchingCluster,
    selectCluster,
  };
}
