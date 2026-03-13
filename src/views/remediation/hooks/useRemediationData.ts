import { useCallback, useEffect, useMemo, useState } from "react";
import { runAsyncAction, runReadLoad } from "../../../app/hooks/asyncTask";
import { useAuthSession } from "../../../context/AuthSessionContext";
import { api } from "../../../lib/api";
import type { RemediationProposal } from "../../../types";
import { compareProposalPriority, normalizeRisk, type RiskFilter, type StatusFilter } from "../utils";

interface RemediationStats {
  total: number;
  proposed: number;
  approved: number;
  executed: number;
  rejected: number;
  highRiskOpen: number;
}

/**
 * State and actions for the remediation view.
 */
interface UseRemediationDataResult {
  canRead: boolean;
  canWrite: boolean;
  items: RemediationProposal[];
  selectedID: string | null;
  rejectingID: string | null;
  rejectReason: string;
  executing: RemediationProposal | null;
  isLoading: boolean;
  isActing: boolean;
  error: string | null;
  message: string | null;
  statusFilter: StatusFilter;
  riskFilter: RiskFilter;
  searchQuery: string;
  sortedItems: RemediationProposal[];
  filteredItems: RemediationProposal[];
  selectedProposal: RemediationProposal | null;
  queueHead: RemediationProposal | null;
  stats: RemediationStats;
  setSelectedID: (id: string | null) => void;
  setRejectingID: (id: string | null) => void;
  setRejectReason: (reason: string) => void;
  setExecuting: (proposal: RemediationProposal | null) => void;
  setStatusFilter: (status: StatusFilter) => void;
  setRiskFilter: (risk: RiskFilter) => void;
  setSearchQuery: (query: string) => void;
  refresh: () => Promise<void>;
  propose: () => Promise<void>;
  approve: (id: string) => Promise<RemediationProposal | null>;
  approveAndPrepareExecute: (proposal: RemediationProposal) => Promise<void>;
  execute: (proposal: RemediationProposal) => Promise<void>;
  reject: (id: string, reason: string) => Promise<void>;
}

/**
 * Manages proposal retrieval, filtering, and remediation action flows.
 *
 * @returns Remediation state and action handlers.
 */
export function useRemediationData(): UseRemediationDataResult {
  const { can } = useAuthSession();
  const canRead = can("read");
  const canWrite = can("write");

  const [items, setItems] = useState<RemediationProposal[]>([]);
  const [selectedID, setSelectedIDState] = useState<string | null>(null);
  const [rejectingID, setRejectingIDState] = useState<string | null>(null);
  const [rejectReason, setRejectReasonState] = useState("");
  const [executing, setExecutingState] = useState<RemediationProposal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilterState] = useState<StatusFilter>("all");
  const [riskFilter, setRiskFilterState] = useState<RiskFilter>("all");
  const [searchQuery, setSearchQueryState] = useState("");

  const setSelectedID = useCallback((id: string | null) => {
    setSelectedIDState(id);
  }, []);

  const setRejectingID = useCallback((id: string | null) => {
    setRejectingIDState(id);
  }, []);

  const setRejectReason = useCallback((reason: string) => {
    setRejectReasonState(reason);
  }, []);

  const setExecuting = useCallback((proposal: RemediationProposal | null) => {
    setExecutingState(proposal);
  }, []);

  const setStatusFilter = useCallback((status: StatusFilter) => {
    setStatusFilterState(status);
  }, []);

  const setRiskFilter = useCallback((risk: RiskFilter) => {
    setRiskFilterState(risk);
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query);
  }, []);

  const chooseDefaultSelection = useCallback((rows: RemediationProposal[]) => {
    if (rows.length === 0) {
      setSelectedIDState(null);
      return;
    }
    const next = [...rows].sort(compareProposalPriority)[0];
    setSelectedIDState(next.id);
  }, []);

  const refresh = useCallback(async () => {
    await runReadLoad({
      canRead,
      deniedMessage: "Authenticate to view remediation proposals.",
      fallbackError: "Failed to load remediation proposals",
      setIsLoading,
      setError,
      onDenied: () => {
        setItems([]);
      },
      load: async () => {
        const data = await api.listRemediation();
        setItems(data);
        setSelectedIDState((current) =>
          current && data.some((item) => item.id === current) ? current : (data[0]?.id ?? null),
        );
      },
    });
  }, [canRead]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const approveID = params.get("approve");
    if (approveID && approveID.trim() !== "") {
      setSelectedIDState(approveID.trim());
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sortedItems = useMemo(() => [...items].sort(compareProposalPriority), [items]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return sortedItems.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) {
        return false;
      }
      if (riskFilter !== "all" && normalizeRisk(item.riskLevel) !== riskFilter) {
        return false;
      }
      if (query === "") {
        return true;
      }
      return `${item.id} ${item.kind} ${item.resource} ${item.namespace} ${item.reason} ${item.status}`
        .toLowerCase()
        .includes(query);
    });
  }, [riskFilter, searchQuery, sortedItems, statusFilter]);

  const selectedProposal = useMemo(() => {
    if (!selectedID) {
      return null;
    }
    return items.find((item) => item.id === selectedID) ?? null;
  }, [items, selectedID]);

  const queueHead = useMemo(
    () => sortedItems.find((item) => item.status === "proposed" || item.status === "approved") ?? null,
    [sortedItems],
  );

  const stats = useMemo(() => {
    const proposed = items.filter((item) => item.status === "proposed").length;
    const approved = items.filter((item) => item.status === "approved").length;
    const executed = items.filter((item) => item.status === "executed").length;
    const rejected = items.filter((item) => item.status === "rejected").length;
    const highRiskOpen = items.filter(
      (item) => normalizeRisk(item.riskLevel) === "high" && (item.status === "proposed" || item.status === "approved"),
    ).length;
    return { total: items.length, proposed, approved, executed, rejected, highRiskOpen };
  }, [items]);

  const propose = useCallback(async () => {
    await runAsyncAction({
      setBusy: setIsActing,
      setError,
      fallbackError: "Failed to generate proposals",
      action: async () => {
        const proposals = await api.proposeRemediation();
        setItems(proposals);
        chooseDefaultSelection(proposals);
        setMessage(`Generated ${proposals.length} remediation proposal(s).`);
        setError(null);
      },
    });
  }, [chooseDefaultSelection]);

  const approve = useCallback(
    async (id: string) => {
      if (!canWrite) {
        return null;
      }
      let updated: RemediationProposal | null = null;
      await runAsyncAction({
        setBusy: setIsActing,
        setError,
        fallbackError: "Failed to approve proposal",
        action: async () => {
          updated = await api.approveRemediation(id);
          setItems((current) => current.map((item) => (item.id === id ? updated! : item)));
          setMessage(`Proposal ${id} approved.`);
          setError(null);
        },
      });
      return updated;
    },
    [canWrite],
  );

  const approveAndPrepareExecute = useCallback(
    async (proposal: RemediationProposal) => {
      const updated = await approve(proposal.id);
      if (!updated) {
        return;
      }
      setExecutingState(updated);
      setMessage(`Proposal ${proposal.id} approved. Confirm execution next.`);
    },
    [approve],
  );

  const execute = useCallback(
    async (proposal: RemediationProposal) => {
      if (!canWrite) {
        return;
      }
      await runAsyncAction({
        setBusy: setIsActing,
        setError,
        fallbackError: "Failed to execute proposal",
        action: async () => {
          const updated = await api.executeRemediation(proposal.id);
          setItems((current) => current.map((item) => (item.id === proposal.id ? updated : item)));
          setExecutingState(null);
          setMessage(`Proposal ${proposal.id} executed.`);
          setError(null);
        },
      });
    },
    [canWrite],
  );

  const reject = useCallback(
    async (id: string, reason: string) => {
      if (!canRead) {
        return;
      }
      await runAsyncAction({
        setBusy: setIsActing,
        setError,
        fallbackError: "Failed to reject proposal",
        action: async () => {
          const updated = await api.rejectRemediation(id, { reason });
          setItems((current) => current.map((item) => (item.id === id ? updated : item)));
          setRejectingIDState(null);
          setRejectReasonState("");
          setMessage(`Proposal ${id} rejected.`);
          setError(null);
        },
      });
    },
    [canRead],
  );

  return {
    canRead,
    canWrite,
    items,
    selectedID,
    rejectingID,
    rejectReason,
    executing,
    isLoading,
    isActing,
    error,
    message,
    statusFilter,
    riskFilter,
    searchQuery,
    sortedItems,
    filteredItems,
    selectedProposal,
    queueHead,
    stats,
    setSelectedID,
    setRejectingID,
    setRejectReason,
    setExecuting,
    setStatusFilter,
    setRiskFilter,
    setSearchQuery,
    refresh,
    propose,
    approve,
    approveAndPrepareExecute,
    execute,
    reject,
  };
}
