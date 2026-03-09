import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const selectCluster = async (nextCluster: string) => {
    if (!clusterContexts || nextCluster === clusterContexts.selected) {
      return;
    }

    setIsSwitchingCluster(true);
    try {
      const response = await api.selectCluster(nextCluster);
      if (!mountedRef.current) {
        return;
      }
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
      if (mountedRef.current) {
        onMessage(err instanceof Error ? err.message : "Failed to switch cluster");
      }
    } finally {
      if (mountedRef.current) {
        setIsSwitchingCluster(false);
      }
    }
  };

  return {
    clusterRefreshKey,
    isSwitchingCluster,
    selectCluster,
  };
}
