export function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-1 text-zinc-300 text-[11px]">
      <span className="text-zinc-500">{label}:</span> {value}
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="rounded-md border border-zinc-700 bg-zinc-800/60 px-2 py-1">
      <span className="text-zinc-500">{label}:</span> {value}
    </p>
  );
}
