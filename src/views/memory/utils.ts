import type { MemoryFixCreateRequest, MemoryRunbookUpsertRequest } from "../../types";

export const EMPTY_RUNBOOK: MemoryRunbookUpsertRequest = {
  title: "",
  tags: [],
  description: "",
  steps: [],
};

export const EMPTY_FIX: MemoryFixCreateRequest = {
  incidentId: "",
  proposalId: "",
  title: "",
  description: "",
  resource: "",
  kind: "restart_pod",
};

export function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

export function parseMultiline(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

export function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}
