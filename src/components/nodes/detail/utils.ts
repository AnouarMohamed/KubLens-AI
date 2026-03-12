import type { K8sEvent } from "../../../types";

export function parsePercent(raw: string): number {
  const value = Number.parseFloat(raw.replace("%", ""));
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 100);
}

export function estimateMinutesToThreshold(
  history: Array<{ time: string; value: number }>,
  threshold: number,
  sampleMinutes: number,
) {
  if (history.length < 2) {
    return {
      message: "Insufficient history",
      detail: "Collect more CPU data points to project risk.",
      tone: "normal" as const,
    };
  }

  const first = history[0].value;
  const last = history[history.length - 1].value;
  const slopePerSample = (last - first) / Math.max(1, history.length - 1);
  if (slopePerSample <= 0) {
    return {
      message: "Stable or decreasing",
      detail: "CPU trend is not currently rising.",
      tone: "normal" as const,
    };
  }

  if (last >= threshold) {
    return {
      message: `Above ${threshold}% now`,
      detail: "CPU already exceeds the risk threshold.",
      tone: "critical" as const,
    };
  }

  const samplesUntilThreshold = (threshold - last) / slopePerSample;
  const minutes = Math.max(1, Math.round(samplesUntilThreshold * sampleMinutes));
  return {
    message: `~${minutes}m to ${threshold}%`,
    detail: `Projected from recent CPU history (${history.length} points).`,
    tone: minutes < 30 ? ("warning" as const) : ("normal" as const),
  };
}

export function sortNodeEvents(events: K8sEvent[]): K8sEvent[] {
  return [...events].sort((a, b) => {
    const left = a.lastTimestamp ?? "";
    const right = b.lastTimestamp ?? "";
    return right.localeCompare(left);
  });
}
