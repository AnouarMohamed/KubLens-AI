import type { IncidentPrediction } from "../../types";

export function summarizePredictions(items: IncidentPrediction[]) {
  let high = 0;
  let medium = 0;
  let low = 0;

  for (const item of items) {
    if (item.riskScore >= 80) {
      high++;
    } else if (item.riskScore >= 60) {
      medium++;
    } else {
      low++;
    }
  }

  const total = items.length || 1;
  return {
    total: items.length,
    high,
    medium,
    low,
    highPct: (high / total) * 100,
    mediumPct: (medium / total) * 100,
    lowPct: (low / total) * 100,
  };
}

export function formatPredictionTimestamp(value?: string): string {
  if (!value) {
    return "n/a";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export function sourceBadge(source?: string): { text: string; className: string } | undefined {
  if (!source) {
    return undefined;
  }

  const normalized = source.toLowerCase();
  if (normalized.includes("python")) {
    return { text: "live predictor", className: "border-[#34c759]/45 bg-[#34c759]/14 text-zinc-100" };
  }
  if (normalized.includes("fallback")) {
    return { text: "fallback", className: "border-[#eab308]/45 bg-[#eab308]/14 text-zinc-100" };
  }
  return { text: "custom", className: "border-zinc-600 bg-zinc-800/70 text-zinc-100" };
}
