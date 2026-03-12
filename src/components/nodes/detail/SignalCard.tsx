interface SignalCardProps {
  title: string;
  value: string;
  note: string;
  tone: "normal" | "warning" | "critical";
}

export function SignalCard({ title, value, note, tone }: SignalCardProps) {
  const toneClass =
    tone === "critical"
      ? "border-[#ff4444]/45 bg-[#ff4444]/12"
      : tone === "warning"
        ? "border-[#eab308]/45 bg-[#eab308]/12"
        : "border-zinc-800 bg-zinc-900/60";

  return (
    <div className={`rounded-md border px-3 py-2 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-1 text-sm text-zinc-100">{value}</p>
      <p className="text-xs text-zinc-400 mt-1">{note}</p>
    </div>
  );
}
