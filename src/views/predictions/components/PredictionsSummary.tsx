import type { IncidentPrediction, PredictionsResult } from "../../../types";
import { formatPredictionTimestamp, sourceBadge } from "../utils";
import { PredictionCard, StatCard } from "./PredictionsPrimitives";

interface PredictionsSummaryProps {
  payload: PredictionsResult | null;
  summary: {
    total: number;
    high: number;
    medium: number;
    low: number;
    highPct: number;
    mediumPct: number;
    lowPct: number;
  };
  topItems: IncidentPrediction[];
}

export function PredictionsSummary({ payload, summary, topItems }: PredictionsSummaryProps) {
  return (
    <>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <StatCard label="Prediction Source" value={payload?.source ?? "-"} badge={sourceBadge(payload?.source)} />
        <StatCard label="Total Predictions" value={String(summary.total)} />
        <StatCard label="High Risk (80+)" value={String(summary.high)} />
        <StatCard label="Medium Risk (60-79)" value={String(summary.medium)} />
        <StatCard label="Generated At" value={formatPredictionTimestamp(payload?.generatedAt)} />
      </section>

      <section className="surface p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-100">Risk Distribution</h3>
          <p className="text-xs text-zinc-500">
            High {summary.high} | Medium {summary.medium} | Low {summary.low}
          </p>
        </div>
        <div className="mt-3 h-4 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
          <div className="flex h-full">
            <div className="bg-[#ff4444]" style={{ width: `${summary.highPct}%` }} />
            <div className="bg-[#eab308]" style={{ width: `${summary.mediumPct}%` }} />
            <div className="bg-[#34c759]" style={{ width: `${summary.lowPct}%` }} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {topItems.map((item) => (
          <PredictionCard key={item.id} item={item} />
        ))}
        {topItems.length === 0 && (
          <article className="surface p-4 xl:col-span-3">
            <p className="text-sm text-zinc-400">
              No high-signal predictions yet. Generate cluster activity and refresh.
            </p>
          </article>
        )}
      </section>
    </>
  );
}
