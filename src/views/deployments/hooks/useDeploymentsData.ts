import { useCallback, useEffect, useMemo, useState } from "react";
import { runAsyncAction, runReadLoad } from "../../../app/hooks/asyncTask";
import { useAuthSession } from "../../../context/AuthSessionContext";
import { api } from "../../../lib/api";
import type { ResourceRecord } from "../../../types";
import type { DeploymentDetail } from "../types";

/**
 * State and actions for the deployments view.
 */
interface UseDeploymentsDataResult {
  canRead: boolean;
  canWrite: boolean;
  items: ResourceRecord[];
  search: string;
  namespaceFilter: string;
  isLoading: boolean;
  isActing: boolean;
  error: string | null;
  message: string | null;
  scaleTarget: ResourceRecord | null;
  scaleReplicas: string;
  detail: DeploymentDetail | null;
  yamlEditor: DeploymentDetail | null;
  namespaces: string[];
  filtered: ResourceRecord[];
  setSearch: (value: string) => void;
  setNamespaceFilter: (value: string) => void;
  setScaleTarget: (value: ResourceRecord | null) => void;
  setScaleReplicas: (value: string) => void;
  setDetail: (value: DeploymentDetail | null) => void;
  setYAMLEditor: (value: DeploymentDetail | null) => void;
  updateYAMLEditorContent: (yaml: string) => void;
  load: () => Promise<void>;
  openDetail: (item: ResourceRecord) => Promise<void>;
  openYAMLEditor: (item: ResourceRecord) => Promise<void>;
  applyYAML: () => Promise<void>;
  scale: () => Promise<void>;
  restart: (item: ResourceRecord) => Promise<void>;
  rollback: (item: ResourceRecord) => Promise<void>;
}

/**
 * Handles deployment inventory loading and operational actions.
 *
 * @returns Deployments state and command handlers.
 */
export function useDeploymentsData(): UseDeploymentsDataResult {
  const { can, isLoading: authLoading } = useAuthSession();
  const [items, setItems] = useState<ResourceRecord[]>([]);
  const [search, setSearchState] = useState("");
  const [namespaceFilter, setNamespaceFilterState] = useState("All");
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scaleTarget, setScaleTargetState] = useState<ResourceRecord | null>(null);
  const [scaleReplicas, setScaleReplicasState] = useState("1");
  const [detail, setDetailState] = useState<DeploymentDetail | null>(null);
  const [yamlEditor, setYAMLEditorState] = useState<DeploymentDetail | null>(null);
  const canRead = can("read");
  const canWrite = can("write");

  const setSearch = useCallback((value: string) => {
    setSearchState(value);
  }, []);

  const setNamespaceFilter = useCallback((value: string) => {
    setNamespaceFilterState(value);
  }, []);

  const setScaleTarget = useCallback((value: ResourceRecord | null) => {
    setScaleTargetState(value);
  }, []);

  const setScaleReplicas = useCallback((value: string) => {
    setScaleReplicasState(value);
  }, []);

  const setDetail = useCallback((value: DeploymentDetail | null) => {
    setDetailState(value);
  }, []);

  const setYAMLEditor = useCallback((value: DeploymentDetail | null) => {
    setYAMLEditorState(value);
  }, []);

  const updateYAMLEditorContent = useCallback((yaml: string) => {
    setYAMLEditorState((state) => (state ? { ...state, yaml } : null));
  }, []);

  const load = useCallback(async () => {
    await runReadLoad({
      canRead,
      deniedMessage: "Authenticate to view deployments.",
      fallbackError: "Failed to load deployments",
      setIsLoading,
      setError,
      onDenied: () => {
        setItems([]);
      },
      load: async () => {
        const response = await api.getResources("deployments");
        setItems(response.items);
      },
    });
  }, [canRead]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    void load();
  }, [authLoading, load]);

  const namespaces = useMemo(() => {
    return Array.from(
      new Set(
        items
          .map((item) => item.namespace)
          .filter((value): value is string => typeof value === "string" && value !== ""),
      ),
    ).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchNamespace = namespaceFilter === "All" || item.namespace === namespaceFilter;
      const matchSearch =
        query === "" ||
        `${item.name} ${item.namespace ?? ""} ${item.status} ${item.summary ?? ""}`.toLowerCase().includes(query);
      return matchNamespace && matchSearch;
    });
  }, [items, namespaceFilter, search]);

  const openDetail = useCallback(
    async (item: ResourceRecord) => {
      if (!canRead || !item.namespace) {
        setError("Deployment detail requires read access and namespace.");
        return;
      }
      const namespace = item.namespace;
      await runAsyncAction({
        setBusy: setIsActing,
        setError,
        fallbackError: "Failed to load deployment detail",
        action: async () => {
          const response = await api.getResourceYAML("deployments", namespace, item.name);
          setDetailState({ target: item, yaml: response.yaml });
          setError(null);
        },
      });
    },
    [canRead],
  );

  const openYAMLEditor = useCallback(
    async (item: ResourceRecord) => {
      if (!canWrite || !item.namespace) {
        setError("Your role does not allow YAML actions.");
        return;
      }
      const namespace = item.namespace;
      await runAsyncAction({
        setBusy: setIsActing,
        setError,
        fallbackError: "Failed to load deployment YAML",
        action: async () => {
          const response = await api.getResourceYAML("deployments", namespace, item.name);
          setYAMLEditorState({ target: item, yaml: response.yaml });
          setError(null);
        },
      });
    },
    [canWrite],
  );

  const applyYAML = useCallback(async () => {
    if (!canWrite || !yamlEditor?.target.namespace) {
      setError("Your role does not allow YAML actions.");
      return;
    }
    const namespace = yamlEditor.target.namespace;
    const name = yamlEditor.target.name;
    const yaml = yamlEditor.yaml;
    await runAsyncAction({
      setBusy: setIsActing,
      setError,
      fallbackError: "Failed to apply YAML",
      action: async () => {
        const response = await api.applyResourceYAML("deployments", namespace, name, { yaml });
        let finalMessage = response.message;
        if ("requiresForce" in response && response.requiresForce) {
          const force = window.confirm(
            `${response.message}\n\nRisk score: ${response.report.score} (${response.report.level}).\nApply anyway with force=true?`,
          );
          if (!force) {
            setMessage(`Apply canceled. Risk score ${response.report.score} requires explicit force override.`);
            setError(null);
            return;
          }

          const forced = await api.applyResourceYAMLWithForce("deployments", namespace, name, { yaml }, true);
          if ("requiresForce" in forced && forced.requiresForce) {
            setError("Risk guard still blocked the apply request.");
            return;
          }
          finalMessage = forced.message;
        }

        setMessage(finalMessage);
        setYAMLEditorState(null);
        await load();
        setError(null);
      },
    });
  }, [canWrite, load, yamlEditor]);

  const scale = useCallback(async () => {
    if (!canWrite || !scaleTarget?.namespace) {
      setError("Your role does not allow scaling.");
      return;
    }
    const namespace = scaleTarget.namespace;
    const name = scaleTarget.name;
    const replicas = Number.parseInt(scaleReplicas, 10);
    if (!Number.isFinite(replicas) || replicas < 0) {
      setError("Replicas must be a positive integer or zero.");
      return;
    }

    await runAsyncAction({
      setBusy: setIsActing,
      setError,
      fallbackError: "Failed to scale deployment",
      action: async () => {
        const response = await api.scaleResource("deployments", namespace, name, { replicas });
        setMessage(response.message);
        setScaleTargetState(null);
        await load();
        setError(null);
      },
    });
  }, [canWrite, load, scaleReplicas, scaleTarget]);

  const restart = useCallback(
    async (item: ResourceRecord) => {
      if (!canWrite || !item.namespace) {
        setError("Your role does not allow restart.");
        return;
      }
      const namespace = item.namespace;
      if (!window.confirm(`Restart deployment ${namespace}/${item.name}?`)) {
        return;
      }
      await runAsyncAction({
        setBusy: setIsActing,
        setError,
        fallbackError: "Failed to restart deployment",
        action: async () => {
          const response = await api.restartResource("deployments", namespace, item.name);
          setMessage(response.message);
          await load();
        },
      });
    },
    [canWrite, load],
  );

  const rollback = useCallback(
    async (item: ResourceRecord) => {
      if (!canWrite || !item.namespace) {
        setError("Your role does not allow rollback.");
        return;
      }
      const namespace = item.namespace;
      if (!window.confirm(`Rollback deployment ${namespace}/${item.name}?`)) {
        return;
      }
      await runAsyncAction({
        setBusy: setIsActing,
        setError,
        fallbackError: "Failed to rollback deployment",
        action: async () => {
          const response = await api.rollbackResource("deployments", namespace, item.name);
          setMessage(response.message);
          await load();
        },
      });
    },
    [canWrite, load],
  );

  return {
    canRead,
    canWrite,
    items,
    search,
    namespaceFilter,
    isLoading,
    isActing,
    error,
    message,
    scaleTarget,
    scaleReplicas,
    detail,
    yamlEditor,
    namespaces,
    filtered,
    setSearch,
    setNamespaceFilter,
    setScaleTarget,
    setScaleReplicas,
    setDetail,
    setYAMLEditor,
    updateYAMLEditorContent,
    load,
    openDetail,
    openYAMLEditor,
    applyYAML,
    scale,
    restart,
    rollback,
  };
}
