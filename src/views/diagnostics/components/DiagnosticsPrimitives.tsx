import type { DiagnosticSeverity } from "../../../types";

interface StatCardProps {
  label: string;
  value: string;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-100">{value}</p>
    </div>
  );
}

interface SnapshotRowProps {
  label: string;
  value: string;
}

export function SnapshotRow({ label, value }: SnapshotRowProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className="text-sm font-semibold text-zinc-100">{value}</span>
    </div>
  );
}

interface SeverityBadgeProps {
  severity: DiagnosticSeverity;
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const className =
    severity === "critical"
      ? "border-[#ff4444]/50 bg-[#ff4444]/16 text-zinc-100"
      : severity === "warning"
        ? "border-[#eab308]/50 bg-[#eab308]/14 text-zinc-100"
        : "border-[#3b82f6]/50 bg-[#3b82f6]/14 text-zinc-100";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}>
      {severity}
    </span>
  );
}

interface FindingCardProps {
  severity: DiagnosticSeverity;
  title: string;
  resource?: string;
  details: string;
  recommendation: string;
}

export function FindingCard({ severity, title, resource, details, recommendation }: FindingCardProps) {
  return (
    <article className="rounded-md border border-zinc-700 bg-zinc-900/65 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={severity} />
        <p className="text-sm font-semibold text-zinc-100">{title}</p>
        {resource && <span className="text-xs text-zinc-500">{resource}</span>}
      </div>
      <p className="mt-2 text-sm text-zinc-300">{details}</p>
      <p className="mt-2 text-sm text-zinc-200">
        <span className="font-semibold text-zinc-100">Action:</span> {recommendation}
      </p>
    </article>
  );
}

interface DiagnosticsBannerProps {
  text: string;
}

export function DiagnosticsBanner({ text }: DiagnosticsBannerProps) {
  return <div className="rounded-md border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">{text}</div>;
}
