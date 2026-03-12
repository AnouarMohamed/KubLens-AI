import { useCallback, useState } from "react";
import { api } from "../../../lib/api";
import type { Pod } from "../../../types";
import type { PodInspectorState } from "./types";

export function usePodInspector() {
  const [isInspectingPod, setIsInspectingPod] = useState(false);
  const [podInspector, setPodInspector] = useState<PodInspectorState | null>(null);

  const inspectPodDetails = useCallback(async (pod: Pod) => {
    setIsInspectingPod(true);
    try {
      const detail = await api.getPodDetail(pod.namespace, pod.name);
      const payload = JSON.stringify(detail, null, 2);
      setPodInspector({
        title: `Details: ${pod.namespace}/${pod.name}`,
        content: payload,
      });
    } catch (err) {
      setPodInspector({
        title: `Details: ${pod.namespace}/${pod.name}`,
        content: err instanceof Error ? `Failed to load pod details: ${err.message}` : "Failed to load pod details.",
      });
    } finally {
      setIsInspectingPod(false);
    }
  }, []);

  const inspectPodLogs = useCallback(async (pod: Pod) => {
    setIsInspectingPod(true);
    try {
      const logs = await api.getPodLogs(pod.namespace, pod.name, 80);
      setPodInspector({
        title: `Logs: ${pod.namespace}/${pod.name}`,
        content: logs.trim() === "" ? "No logs returned." : logs,
      });
    } catch (err) {
      setPodInspector({
        title: `Logs: ${pod.namespace}/${pod.name}`,
        content: err instanceof Error ? `Failed to load pod logs: ${err.message}` : "Failed to load pod logs.",
      });
    } finally {
      setIsInspectingPod(false);
    }
  }, []);

  const clearPodInspector = useCallback(() => {
    setPodInspector(null);
  }, []);

  return {
    isInspectingPod,
    podInspector,
    inspectPodDetails,
    inspectPodLogs,
    clearPodInspector,
  };
}
