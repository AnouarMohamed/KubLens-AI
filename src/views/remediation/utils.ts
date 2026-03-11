import type { RemediationProposal } from "../../types";

export type StatusFilter = "all" | "proposed" | "approved" | "executed" | "rejected";
export type RiskFilter = "all" | "high" | "medium" | "low";

export function compareProposalPriority(a: RemediationProposal, b: RemediationProposal): number {
  const scoreDelta = proposalPriorityScore(b) - proposalPriorityScore(a);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }
  return parseDate(b.updatedAt) - parseDate(a.updatedAt);
}

export function proposalPriorityScore(proposal: RemediationProposal): number {
  const statusWeight =
    proposal.status === "proposed" ? 40 : proposal.status === "approved" ? 30 : proposal.status === "executed" ? 10 : 0;
  const riskWeight =
    normalizeRisk(proposal.riskLevel) === "high"
      ? 9
      : normalizeRisk(proposal.riskLevel) === "medium"
        ? 6
        : normalizeRisk(proposal.riskLevel) === "low"
          ? 3
          : 1;
  return statusWeight + riskWeight;
}

export function parseDate(value: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

export function normalizeRisk(level: string): RiskFilter {
  const normalized = level.trim().toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return "all";
}

export function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function riskClass(level: string): string {
  const normalized = level.trim().toLowerCase();
  if (normalized === "high") {
    return "border-[var(--red)]/40 bg-[var(--red)]/12 text-zinc-100";
  }
  if (normalized === "medium") {
    return "border-[var(--amber)]/40 bg-[var(--amber)]/12 text-zinc-100";
  }
  return "border-[#34c759]/40 bg-[#34c759]/12 text-zinc-100";
}

export function displayResource(proposal: RemediationProposal): string {
  if (proposal.namespace.trim() === "") {
    return proposal.resource;
  }
  return `${proposal.namespace}/${proposal.resource}`;
}
