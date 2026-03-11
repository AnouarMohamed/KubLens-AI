/**
 * Cluster-context loading hook for multi-cluster deployments.
 */
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { ClusterContextList } from "../../types";

/**
 * Input contract for {@link useClusterContexts}.
 */
interface UseClusterContextsInput {
  authLoading: boolean;
  canRead: boolean;
}

/**
 * Fetches available cluster contexts and exposes local update capability.
 *
 * @param input - Auth and read-access flags.
 * @returns Loaded context list and state setter.
 */
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
