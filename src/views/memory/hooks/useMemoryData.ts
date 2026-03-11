import { useCallback, useEffect, useState } from "react";
import { useAuthSession } from "../../../context/AuthSessionContext";
import { api } from "../../../lib/api";
import type {
  MemoryFixCreateRequest,
  MemoryFixPattern,
  MemoryRunbook,
  MemoryRunbookUpsertRequest,
} from "../../../types";
import { EMPTY_FIX, EMPTY_RUNBOOK, parseList, parseMultiline } from "../utils";

interface UseMemoryDataResult {
  canRead: boolean;
  canWrite: boolean;
  query: string;
  runbooks: MemoryRunbook[];
  fixes: MemoryFixPattern[];
  editingID: string | null;
  runbookForm: MemoryRunbookUpsertRequest;
  fixForm: MemoryFixCreateRequest;
  isLoading: boolean;
  isActing: boolean;
  error: string | null;
  message: string | null;
  setQuery: (value: string) => void;
  updateRunbookForm: (patch: Partial<MemoryRunbookUpsertRequest>) => void;
  updateFixForm: (patch: Partial<MemoryFixCreateRequest>) => void;
  searchRunbooks: () => Promise<void>;
  searchFixes: () => Promise<void>;
  startEditingRunbook: (runbook: MemoryRunbook) => void;
  resetRunbookForm: () => void;
  saveRunbook: () => Promise<void>;
  saveFix: () => Promise<void>;
}

export function useMemoryData(): UseMemoryDataResult {
  const { can } = useAuthSession();
  const canRead = can("read");
  const canWrite = can("write");

  const [query, setQueryState] = useState("");
  const [runbooks, setRunbooks] = useState<MemoryRunbook[]>([]);
  const [fixes, setFixes] = useState<MemoryFixPattern[]>([]);
  const [editingID, setEditingID] = useState<string | null>(null);
  const [runbookForm, setRunbookForm] = useState<MemoryRunbookUpsertRequest>(EMPTY_RUNBOOK);
  const [fixForm, setFixForm] = useState<MemoryFixCreateRequest>(EMPTY_FIX);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const setQuery = useCallback((value: string) => {
    setQueryState(value);
  }, []);

  const updateRunbookForm = useCallback((patch: Partial<MemoryRunbookUpsertRequest>) => {
    setRunbookForm((current) => ({ ...current, ...patch }));
  }, []);

  const updateFixForm = useCallback((patch: Partial<MemoryFixCreateRequest>) => {
    setFixForm((current) => ({ ...current, ...patch }));
  }, []);

  const refreshRunbooks = useCallback(
    async (q = query) => {
      if (!canRead) {
        setRunbooks([]);
        setError("Authenticate to view memory runbooks.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const data = await api.searchMemoryRunbooks(q);
        setRunbooks(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load runbooks");
      } finally {
        setIsLoading(false);
      }
    },
    [canRead, query],
  );

  const refreshFixes = useCallback(
    async (q = query) => {
      if (!canRead) {
        setFixes([]);
        return;
      }
      try {
        const data = await api.listMemoryFixes(q);
        setFixes(data);
      } catch {
        setFixes([]);
      }
    },
    [canRead, query],
  );

  useEffect(() => {
    void refreshRunbooks("");
    void refreshFixes("");
  }, [refreshFixes, refreshRunbooks]);

  const startEditingRunbook = useCallback((runbook: MemoryRunbook) => {
    setEditingID(runbook.id);
    setRunbookForm({
      title: runbook.title,
      tags: runbook.tags,
      description: runbook.description,
      steps: runbook.steps,
    });
  }, []);

  const resetRunbookForm = useCallback(() => {
    setEditingID(null);
    setRunbookForm(EMPTY_RUNBOOK);
  }, []);

  const saveRunbook = useCallback(async () => {
    if (!canWrite) {
      return;
    }

    setIsActing(true);
    try {
      const payload: MemoryRunbookUpsertRequest = {
        title: runbookForm.title.trim(),
        description: runbookForm.description.trim(),
        tags: parseList(runbookForm.tags.join(", ")),
        steps: parseMultiline(runbookForm.steps.join("\n")),
      };

      if (editingID) {
        await api.updateMemoryRunbook(editingID, payload);
        setMessage(`Runbook ${editingID} updated.`);
      } else {
        const created = await api.createMemoryRunbook(payload);
        setMessage(`Runbook ${created.id} created.`);
      }

      resetRunbookForm();
      await refreshRunbooks(query);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save runbook");
    } finally {
      setIsActing(false);
    }
  }, [canWrite, editingID, query, refreshRunbooks, resetRunbookForm, runbookForm]);

  const saveFix = useCallback(async () => {
    if (!canWrite) {
      return;
    }

    setIsActing(true);
    try {
      const payload: MemoryFixCreateRequest = {
        incidentId: fixForm.incidentId.trim(),
        proposalId: fixForm.proposalId.trim(),
        title: fixForm.title.trim(),
        description: fixForm.description.trim(),
        resource: fixForm.resource.trim(),
        kind: fixForm.kind,
      };

      const created = await api.recordMemoryFix(payload);
      setMessage(`Fix pattern ${created.id} recorded.`);
      setFixForm(EMPTY_FIX);
      await refreshFixes();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record fix");
    } finally {
      setIsActing(false);
    }
  }, [canWrite, fixForm, refreshFixes]);

  const searchRunbooks = useCallback(async () => {
    await refreshRunbooks(query);
  }, [query, refreshRunbooks]);

  const searchFixes = useCallback(async () => {
    await refreshFixes(query);
  }, [query, refreshFixes]);

  return {
    canRead,
    canWrite,
    query,
    runbooks,
    fixes,
    editingID,
    runbookForm,
    fixForm,
    isLoading,
    isActing,
    error,
    message,
    setQuery,
    updateRunbookForm,
    updateFixForm,
    searchRunbooks,
    searchFixes,
    startEditingRunbook,
    resetRunbookForm,
    saveRunbook,
    saveFix,
  };
}
