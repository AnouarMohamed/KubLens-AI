const STATUS_CLASS: Record<string, string> = {
  Running: "border-[#4f7bff]/45 bg-[#4f7bff]/18 text-zinc-100",
  Pending: "border-[#eab308]/45 bg-[#eab308]/18 text-zinc-100",
  Failed: "border-[#d946ef]/45 bg-[#d946ef]/18 text-zinc-100",
  Succeeded: "border-[#34c759]/45 bg-[#34c759]/18 text-zinc-100",
  Unknown: "border-zinc-700 bg-zinc-800/70 text-zinc-300",
};

export default function PodStatusBadge({ status }: { status: string }) {
  const className = STATUS_CLASS[status] ?? STATUS_CLASS.Unknown;
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${className}`}>{status}</span>;
}
