interface InfoCardProps {
  label: string;
  capacity: string;
  allocatable: string;
}

export function InfoCard({ label, capacity, allocatable }: InfoCardProps) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-sm text-zinc-200">Capacity: {capacity}</p>
      <p className="text-sm text-zinc-200">Allocatable: {allocatable}</p>
    </div>
  );
}
