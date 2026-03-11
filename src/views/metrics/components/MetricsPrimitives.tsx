import type { ReactNode } from "react";

export function SignalCard({
  label,
  value,
  detail,
  fill,
}: {
  label: string;
  value: string;
  detail: string;
  fill: number;
}) {
  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-4">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100">{value}</p>
      <p className="mt-1 text-xs text-zinc-400">{detail}</p>
      <div className="mt-3 h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div className="h-full bg-[#3b82f6]" style={{ width: `${fill}%` }} />
      </div>
    </div>
  );
}

export function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4">
      <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
        active ? "border-[#3b82f6] bg-[#3b82f6]/18 text-zinc-100" : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
      }`}
    >
      {label}
    </button>
  );
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[340px] flex items-center justify-center rounded-md border border-dashed border-zinc-700 text-sm text-zinc-500">
      {message}
    </div>
  );
}
