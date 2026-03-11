export type AssistantIntent = "triage" | "remediate" | "verify";

export const ASSISTANT_DRAFT_KEY = "k8s-ops.assistant.draft.v1";

export const intentOptions: Array<{ value: AssistantIntent; label: string }> = [
  { value: "triage", label: "Triage" },
  { value: "remediate", label: "Remediate" },
  { value: "verify", label: "Verify" },
];
