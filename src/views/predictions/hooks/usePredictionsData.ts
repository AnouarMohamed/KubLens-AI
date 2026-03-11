import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../../../lib/api";
import type { IncidentPrediction, PredictionsResult } from "../../../types";
import { summarizePredictions } from "../utils";

interface UsePredictionsDataResult {
  payload: PredictionsResult | null;
  isLoading: boolean;
  autoRefresh: boolean;
  error: string | null;
  items: IncidentPrediction[];
  topItems: IncidentPrediction[];
  summary: ReturnType<typeof summarizePredictions>;
  setAutoRefresh: (enabled: boolean) => void;
  load: (force?: boolean) => Promise<void>;
}

export function usePredictionsData(): UsePredictionsDataResult {
  const [payload, setPayload] = useState<PredictionsResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefreshState] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setIsLoading(true);
    try {
      const response = await api.getPredictions(force);
      setPayload(response);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Predictions endpoint is missing on the running backend. Restart API to load latest code.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load predictions");
      }
      setPayload(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const timer = window.setInterval(() => void load(false), 20000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, load]);

  const items = useMemo(() => payload?.items ?? [], [payload]);
  const summary = useMemo(() => summarizePredictions(items), [items]);
  const topItems = useMemo(() => items.slice(0, 3), [items]);

  const setAutoRefresh = useCallback((enabled: boolean) => {
    setAutoRefreshState(enabled);
  }, []);

  return {
    payload,
    isLoading,
    autoRefresh,
    error,
    items,
    topItems,
    summary,
    setAutoRefresh,
    load,
  };
}
