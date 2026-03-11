import type { RunbookStep, RunbookStepStatus, TimelineEntry } from "../../types";

export type TimelineFilter = "all" | TimelineEntry["kind"];

export const timelineFilters: Array<{ value: TimelineFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "diagnostic", label: "Diagnostic" },
  { value: "event", label: "Events" },
  { value: "prediction", label: "Prediction" },
  { value: "action", label: "Actions" },
];

export function deriveNextRunbookAction(
  runbook: RunbookStep[],
): { step: RunbookStep; target: RunbookStepStatus; label: string } | null {
  const active = runbook.find((step) => step.status === "in_progress");
  if (active) {
    return {
      step: active,
      target: "done",
      label: `Mark "${active.title}" done`,
    };
  }
  const pending = runbook.find((step) => step.status === "pending");
  if (!pending) {
    return null;
  }
  return {
    step: pending,
    target: "in_progress",
    label: `Start "${pending.title}"`,
  };
}

export function stepIcon(status: RunbookStepStatus): string {
  switch (status) {
    case "in_progress":
      return "[~]";
    case "done":
      return "[x]";
    case "skipped":
      return "[>]";
    default:
      return "[ ]";
  }
}

export function timelineBorderClass(kind: TimelineEntry["kind"]): string {
  switch (kind) {
    case "diagnostic":
      return "border-l-[var(--red)]";
    case "event":
      return "border-l-[var(--amber)]";
    case "prediction":
      return "border-l-[var(--blue)]";
    case "action":
      return "border-l-[var(--accent)]";
    default:
      return "border-l-zinc-700";
  }
}

export function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export function formatKind(kind: string): string {
  return kind.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

export function incidentProgressLabel(runbook: RunbookStep[]): string {
  if (runbook.length === 0) {
    return "0%";
  }
  const complete = runbook.filter((step) => step.status === "done" || step.status === "skipped").length;
  return `${Math.round((complete / runbook.length) * 100)}%`;
}
