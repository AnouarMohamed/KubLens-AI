/**
 * Runtime status hook for backend capability and posture flags.
 */
import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { RuntimeStatus } from "../../types";

/**
 * Input contract for {@link useRuntimeStatus}.
 */
interface UseRuntimeStatusInput {
  authLoading: boolean;
  canRead: boolean;
}

/**
 * Loads runtime flags when read access is available.
 *
 * @param input - Auth and permission state.
 * @returns Current runtime status or `null` when unavailable.
 */
export function useRuntimeStatus({ authLoading, canRead }: UseRuntimeStatusInput) {
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (authLoading || !canRead) {
      return;
    }

    api
      .getRuntimeStatus()
      .then((response) => {
        if (!cancelled) {
          setRuntime(response);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRuntime(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, canRead]);

  return runtime;
}
