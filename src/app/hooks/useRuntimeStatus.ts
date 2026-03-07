import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { RuntimeStatus } from "../../types";

interface UseRuntimeStatusInput {
  authLoading: boolean;
  canRead: boolean;
}

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
