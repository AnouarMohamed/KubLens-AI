import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runReadLoad } from "../../../app/hooks/asyncTask";
import { useStreamRefresh } from "../../../app/hooks/useStreamRefresh";
import { useAuthSession } from "../../../context/AuthSessionContext";
import { api } from "../../../lib/api";
import type { Pod, PodCreateRequest, PodDetail } from "../../../types";

export type PodDetailTab = "specs" | "events" | "describe";

export const POD_STATUSES = ["All", "Running", "Pending", "Failed", "Succeeded", "Unknown"] as const;

export type PodStatusFilter = (typeof POD_STATUSES)[number];

const defaultCreateForm: PodCreateRequest = {
  namespace: "default",
  name: "",
  image: "nginx:latest",
};

/**
 * UI state and actions for the pods view.
 */
interface UsePodsDataResult {
  canRead: boolean;
  canWrite: boolean;
  pods: Pod[];
  filteredPods: Pod[];
  namespaces: string[];
  search: string;
  statusFilter: PodStatusFilter;
  namespaceFilter: string;
  selectedPod: PodDetail | null;
  activeTab: PodDetailTab;
  logText: string | null;
  logPodName: string;
  logStreaming: boolean;
  logError: string | null;
  showCreateForm: boolean;
  createForm: PodCreateRequest;
  confirmingDeleteId: string | null;
  isBusy: boolean;
  isLoading: boolean;
  error: string | null;
  setSearch: (value: string) => void;
  setStatusFilter: (value: PodStatusFilter) => void;
  setNamespaceFilter: (value: string) => void;
  setActiveTab: (tab: PodDetailTab) => void;
  toggleCreateForm: () => void;
  updateCreateFormField: (field: keyof PodCreateRequest, value: string) => void;
  load: () => Promise<void>;
  openDetail: (namespace: string, podName: string) => Promise<void>;
  openLogs: (namespace: string, podName: string) => Promise<void>;
  streamLogs: (namespace: string, podName: string) => Promise<void>;
  stopLogStream: () => void;
  closeLogs: () => void;
  createPod: () => Promise<void>;
  restartPod: (namespace: string, podName: string) => Promise<void>;
  requestDelete: (pod: Pod) => Promise<void>;
  clearSelectedPod: () => void;
}

/**
 * Manages pod inventory state and operational actions.
 *
 * @returns Pods state and command handlers for rendering and interaction.
 */
export function usePodsData(): UsePodsDataResult {
  const { can, isLoading: authLoading } = useAuthSession();
  const [pods, setPods] = useState<Pod[]>([]);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [search, setSearchState] = useState("");
  const [statusFilter, setStatusFilterState] = useState<PodStatusFilter>("All");
  const [namespaceFilter, setNamespaceFilterState] = useState("All");
  const [selectedPod, setSelectedPod] = useState<PodDetail | null>(null);
  const [activeTab, setActiveTabState] = useState<PodDetailTab>("specs");
  const [logText, setLogText] = useState<string | null>(null);
  const [logPodName, setLogPodName] = useState("");
  const [logStreaming, setLogStreaming] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<PodCreateRequest>(defaultCreateForm);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canRead = can("read");
  const canWrite = can("write");
  const logAbortRef = useRef<AbortController | null>(null);
  const maxLogChars = 20000;

  const setSearch = useCallback((value: string) => {
    setSearchState(value);
  }, []);

  const setStatusFilter = useCallback((value: PodStatusFilter) => {
    setStatusFilterState(value);
  }, []);

  const setNamespaceFilter = useCallback((value: string) => {
    setNamespaceFilterState(value);
  }, []);

  const setActiveTab = useCallback((tab: PodDetailTab) => {
    setActiveTabState(tab);
  }, []);

  const toggleCreateForm = useCallback(() => {
    setShowCreateForm((value) => !value);
  }, []);

  const updateCreateFormField = useCallback((field: keyof PodCreateRequest, value: string) => {
    setCreateForm((state) => ({ ...state, [field]: value }));
  }, []);

  const load = useCallback(async () => {
    await runReadLoad({
      canRead,
      deniedMessage: "Authenticate to view pod data.",
      fallbackError: "Failed to load pods",
      setIsLoading,
      setError,
      onDenied: () => {
        setPods([]);
        setNamespaces([]);
      },
      load: async () => {
        const [podRows, namespaceRows] = await Promise.all([api.getPods(), api.getNamespaces()]);
        setPods(podRows);
        setNamespaces(namespaceRows);
        setConfirmingDeleteId(null);
      },
    });
  }, [canRead]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    void load();
  }, [authLoading, load]);

  useEffect(() => {
    return () => {
      logAbortRef.current?.abort();
    };
  }, []);

  useStreamRefresh({
    enabled: canRead,
    eventTypes: ["pod_update", "pod_restart", "pod_failed", "pod_pending", "pod_deleted"],
    onEvent: () => {
      void load();
    },
  });

  const filteredPods = useMemo(() => {
    const query = search.trim().toLowerCase();
    return pods.filter((pod) => {
      const matchesSearch = query === "" || `${pod.name} ${pod.namespace}`.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "All" || pod.status === statusFilter;
      const matchesNamespace = namespaceFilter === "All" || pod.namespace === namespaceFilter;
      return matchesSearch && matchesStatus && matchesNamespace;
    });
  }, [namespaceFilter, pods, search, statusFilter]);

  const openDetail = useCallback(
    async (namespace: string, podName: string) => {
      if (!canRead) {
        setError("Authenticate to view pod details.");
        return;
      }

      setIsBusy(true);
      try {
        const [detail, events, describe] = await Promise.all([
          api.getPodDetail(namespace, podName),
          api.getPodEvents(namespace, podName),
          api
            .getPodDescribe(namespace, podName)
            .catch((err) => (err instanceof Error ? `Describe failed: ${err.message}` : "Describe failed")),
        ]);
        setSelectedPod({ ...detail, events, describe });
        setActiveTabState("specs");
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load pod details");
      } finally {
        setIsBusy(false);
      }
    },
    [canRead],
  );

  const openLogs = useCallback(
    async (namespace: string, podName: string) => {
      if (!canRead) {
        setError("Authenticate to view pod logs.");
        return;
      }

      logAbortRef.current?.abort();
      logAbortRef.current = null;
      setLogStreaming(false);
      setLogError(null);
      setConfirmingDeleteId(null);
      setIsBusy(true);
      try {
        const logs = await api.getPodLogs(namespace, podName, 50);
        setLogPodName(`${namespace}/${podName}`);
        setLogText(logs);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load pod logs");
      } finally {
        setIsBusy(false);
      }
    },
    [canRead],
  );

  const streamLogs = useCallback(
    async (namespace: string, podName: string) => {
      if (!canRead) {
        setError("Authenticate to view pod logs.");
        return;
      }

      logAbortRef.current?.abort();
      const controller = new AbortController();
      logAbortRef.current = controller;
      setLogStreaming(true);
      setLogError(null);
      setConfirmingDeleteId(null);
      setIsBusy(true);
      setLogPodName(`${namespace}/${podName}`);
      setLogText("");

      try {
        const response = await api.streamPodLogs(namespace, podName, 50, undefined, controller.signal);
        if (!response.ok) {
          throw new Error(`Log stream failed with status ${response.status}`);
        }
        if (!response.body) {
          throw new Error("Log stream not available");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            setLogText((prev) => {
              const next = (prev ?? "") + chunk;
              if (next.length > maxLogChars) {
                return next.slice(-maxLogChars);
              }
              return next;
            });
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setLogError(err instanceof Error ? err.message : "Log stream failed");
        }
      } finally {
        if (logAbortRef.current === controller) {
          logAbortRef.current = null;
        }
        setLogStreaming(false);
        setIsBusy(false);
      }
    },
    [canRead],
  );

  const stopLogStream = useCallback(() => {
    logAbortRef.current?.abort();
    logAbortRef.current = null;
    setLogStreaming(false);
  }, []);

  const closeLogs = useCallback(() => {
    stopLogStream();
    setLogText(null);
    setLogError(null);
  }, [stopLogStream]);

  const createPod = useCallback(async () => {
    if (!canWrite) {
      setError("Your role does not allow pod creation.");
      return;
    }
    if (createForm.name.trim() === "") {
      setError("Pod name is required");
      return;
    }

    setIsBusy(true);
    try {
      await api.createPod({
        namespace: createForm.namespace.trim() || "default",
        name: createForm.name.trim(),
        image: createForm.image.trim() || "nginx:latest",
      });
      setCreateForm(defaultCreateForm);
      setShowCreateForm(false);
      await load();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create pod");
    } finally {
      setIsBusy(false);
    }
  }, [canWrite, createForm.image, createForm.name, createForm.namespace, load]);

  const restartPod = useCallback(
    async (namespace: string, podName: string) => {
      if (!canWrite) {
        setError("Your role does not allow pod restart.");
        return;
      }
      if (!window.confirm(`Restart pod ${namespace}/${podName}?`)) {
        return;
      }
      setConfirmingDeleteId(null);

      setIsBusy(true);
      try {
        await api.restartPod(namespace, podName);
        await load();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to restart pod");
      } finally {
        setIsBusy(false);
      }
    },
    [canWrite, load],
  );

  const deletePod = useCallback(
    async (namespace: string, podName: string) => {
      if (!canWrite) {
        setError("Your role does not allow pod deletion.");
        return;
      }
      setConfirmingDeleteId(null);

      setIsBusy(true);
      try {
        await api.deletePod(namespace, podName);
        await load();
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete pod");
      } finally {
        setIsBusy(false);
      }
    },
    [canWrite, load],
  );

  const requestDelete = useCallback(
    async (pod: Pod) => {
      if (confirmingDeleteId != pod.id) {
        setConfirmingDeleteId(pod.id);
        return;
      }
      await deletePod(pod.namespace, pod.name);
    },
    [confirmingDeleteId, deletePod],
  );

  const clearSelectedPod = useCallback(() => {
    setSelectedPod(null);
  }, []);

  return {
    canRead,
    canWrite,
    pods,
    filteredPods,
    namespaces,
    search,
    statusFilter,
    namespaceFilter,
    selectedPod,
    activeTab,
    logText,
    logPodName,
    logStreaming,
    logError,
    showCreateForm,
    createForm,
    confirmingDeleteId,
    isBusy,
    isLoading,
    error,
    setSearch,
    setStatusFilter,
    setNamespaceFilter,
    setActiveTab,
    toggleCreateForm,
    updateCreateFormField,
    load,
    openDetail,
    openLogs,
    streamLogs,
    stopLogStream,
    closeLogs,
    createPod,
    restartPod,
    requestDelete,
    clearSelectedPod,
  };
}
