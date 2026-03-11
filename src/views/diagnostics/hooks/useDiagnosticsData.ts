import { useCallback, useEffect, useMemo, useState } from "react";
import { useStreamRefresh } from "../../../app/hooks/useStreamRefresh";
import { useAuthSession } from "../../../context/AuthSessionContext";
import { api } from "../../../lib/api";
import type { DiagnosticsResult } from "../../../types";
import { buildPrioritizedIssues, extractSummaryHighlights } from "../utils";

interface UseDiagnosticsDataResult {
  canWrite: boolean;
  diagnostics: DiagnosticsResult | null;
  isLoading: boolean;
  isAlerting: boolean;
  alertMessage: string | null;
  error: string | null;
  prioritizedIssues: DiagnosticsResult["issues"];
  summaryHighlights: string[];
  refresh: () => Promise<void>;
  sendTestAlert: () => Promise<void>;
  dispatchTopIssue: () => Promise<void>;
}

export function useDiagnosticsData(): UseDiagnosticsDataResult {
  const { can } = useAuthSession();
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAlerting, setIsAlerting] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canWrite = can("write");
  const canRead = can("read");

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.getDiagnostics();
      setDiagnostics(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load diagnostics");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useStreamRefresh({
    enabled: canRead,
    eventTypes: ["pod_update", "node_update", "deployment_update", "k8s_event"],
    onEvent: () => {
      void refresh();
    },
  });

  const prioritizedIssues = useMemo(() => buildPrioritizedIssues(diagnostics), [diagnostics]);
  const summaryHighlights = useMemo(() => extractSummaryHighlights(diagnostics?.summary ?? ""), [diagnostics?.summary]);

  const dispatchTopIssue = useCallback(async () => {
    if (!canWrite || !diagnostics || prioritizedIssues.length === 0) {
      return;
    }

    const top = prioritizedIssues[0];
    const topEvidence = (top.evidence ?? []).join(" | ") || "No supporting evidence captured yet.";
    setIsAlerting(true);
    try {
      const response = await api.dispatchAlert({
        title: `Diagnostics: ${top.message}`,
        message: `${topEvidence}\nRecommended action: ${top.recommendation}`,
        severity: top.severity,
        source: "diagnostics",
        tags: [top.resource ?? "cluster", top.severity],
      });
      setAlertMessage(
        response.success ? "Alert dispatched to configured channels." : "Alert dispatch partially failed.",
      );
    } catch (err) {
      setAlertMessage(err instanceof Error ? err.message : "Failed to dispatch alert");
    } finally {
      setIsAlerting(false);
    }
  }, [canWrite, diagnostics, prioritizedIssues]);

  const sendTestAlert = useCallback(async () => {
    if (!canWrite) {
      return;
    }

    setIsAlerting(true);
    try {
      const response = await api.sendTestAlert();
      setAlertMessage(response.success ? "Test alert sent." : "Test alert partially failed.");
    } catch (err) {
      setAlertMessage(err instanceof Error ? err.message : "Failed to send test alert");
    } finally {
      setIsAlerting(false);
    }
  }, [canWrite]);

  return {
    canWrite,
    diagnostics,
    isLoading,
    isAlerting,
    alertMessage,
    error,
    prioritizedIssues,
    summaryHighlights,
    refresh,
    sendTestAlert,
    dispatchTopIssue,
  };
}
