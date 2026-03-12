import type { ReactNode } from "react";

export function PanelShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="h-full flex flex-col">
      <header className="px-4 py-3 border-b border-zinc-700 bg-zinc-800/80">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        <p className="text-xs text-zinc-400 mt-0.5">{subtitle}</p>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">{children}</div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  toneClass,
}: {
  label: string;
  value: string;
  toneClass: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

export function ToggleField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2">
      <span className="text-sm text-zinc-200">{label}</span>
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
    </label>
  );
}

export function CapabilityCell({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xs font-semibold ${enabled ? "text-[var(--green)]" : "text-zinc-500"}`}>
        {enabled ? "enabled" : "disabled"}
      </p>
    </div>
  );
}

export function StatusCell({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-xs font-semibold ${ok ? "text-[var(--green)]" : "text-[var(--amber)]"}`}>
        {ok ? "healthy" : "attention"}
      </p>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="rounded-lg border border-zinc-700 bg-zinc-900/70 px-3 py-2">
      <span className="font-semibold text-zinc-100">{label}:</span> <span className="text-zinc-300">{value}</span>
    </p>
  );
}
