import type {
  MemoryFixCreateRequest,
  MemoryFixPattern,
  MemoryRunbook,
  MemoryRunbookUpsertRequest,
  RemediationProposal,
  RemediationRejectRequest,
  RiskAnalyzeRequest,
  RiskReport,
} from "../../../types";
import { apiPath, requestJson } from "../core";

export const remediationApi = {
  proposeRemediation: () =>
    requestJson<RemediationProposal[]>(apiPath("remediation", "propose"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  listRemediation: () => requestJson<RemediationProposal[]>(apiPath("remediation")),
  approveRemediation: (id: string) =>
    requestJson<RemediationProposal>(apiPath("remediation", id, "approve"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  executeRemediation: (id: string) =>
    requestJson<RemediationProposal>(apiPath("remediation", id, "execute"), {
      method: "POST",
      body: JSON.stringify({}),
    }),
  rejectRemediation: (id: string, payload: RemediationRejectRequest) =>
    requestJson<RemediationProposal>(apiPath("remediation", id, "reject"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  searchMemoryRunbooks: (query = "") => {
    const suffix = query.trim() === "" ? "" : `?q=${encodeURIComponent(query.trim())}`;
    return requestJson<MemoryRunbook[]>(`${apiPath("memory", "runbooks")}${suffix}`);
  },
  createMemoryRunbook: (payload: MemoryRunbookUpsertRequest) =>
    requestJson<MemoryRunbook>(apiPath("memory", "runbooks"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateMemoryRunbook: (id: string, payload: MemoryRunbookUpsertRequest) =>
    requestJson<MemoryRunbook>(apiPath("memory", "runbooks", id), {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  listMemoryFixes: (query = "") => {
    const suffix = query.trim() === "" ? "" : `?q=${encodeURIComponent(query.trim())}`;
    return requestJson<MemoryFixPattern[]>(`${apiPath("memory", "fixes")}${suffix}`);
  },
  recordMemoryFix: (payload: MemoryFixCreateRequest) =>
    requestJson<MemoryFixPattern>(apiPath("memory", "fixes"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  analyzeRiskGuard: (payload: RiskAnalyzeRequest) =>
    requestJson<RiskReport>(apiPath("risk-guard", "analyze"), {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
