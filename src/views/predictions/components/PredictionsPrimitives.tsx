import type { IncidentPrediction } from "../../../types";

interface StatCardProps {
  label: string;
  value: string;
  badge?: { text: string; className: string };
}

export function StatCard({ label, value, badge }: StatCardProps) {
  return (
    <div className="kpi">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold text-zinc-100">{value}</p>
      {badge && (
        <span
          className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
        >
          {badge.text}
        </span>
      )}
    </div>
  );
}

interface RiskBadgeProps {
  score: number;
}

export function RiskBadge({ score }: RiskBadgeProps) {
  let className = "border-[#34c759]/45 bg-[#34c759]/14";
  if (score >= 80) {
    className = "border-[#ff4444]/45 bg-[#ff4444]/14";
  } else if (score >= 60) {
    className = "border-[#eab308]/45 bg-[#eab308]/14";
  }

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold text-zinc-100 ${className}`}>{score}</span>
  );
}

interface PredictionCardProps {
  item: IncidentPrediction;
}

export function PredictionCard({ item }: PredictionCardProps) {
  return (
    <article className="surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-100">
          {item.resourceKind}: {item.resource}
        </p>
        <RiskBadge score={item.riskScore} />
      </div>
      {item.namespace && <p className="mt-1 text-xs text-zinc-500">{item.namespace}</p>}
      <p className="mt-3 text-sm text-zinc-300">{item.summary}</p>
      <p className="mt-2 text-sm text-zinc-200">
        <span className="font-semibold">Action:</span> {item.recommendation}
      </p>
      <p className="mt-2 text-xs text-zinc-500">Confidence: {item.confidence}%</p>
    </article>
  );
}
