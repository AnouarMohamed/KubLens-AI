import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { ClusterContextList } from "../../types";

interface UseClusterContextsInput {
  authLoading: boolean;
  canRead: boolean;
}

export function useClusterContexts({ authLoading, canRead }: UseClusterContextsInput) {
  const [clusterContexts, setClusterContexts] = useState<ClusterContextList | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (authLoading) {
      return;
    }
    if (!canRead) {
      setClusterContexts(null);
      return;
    }

    api
      .getClusters()
      .then((response) => {
        if (!cancelled) {
          setClusterContexts(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClusterContexts(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, canRead]);

  return { clusterContexts, setClusterContexts };
}
