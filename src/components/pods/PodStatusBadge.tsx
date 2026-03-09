export default function StatusText({ status }: { status: string }) {
  const s = status.toLowerCase();
  const color =
    s === "running"
      ? "text-[#00d4a8]"
      : s === "failed"
        ? "text-[#ff4444]"
        : s === "pending"
          ? "text-[#f59e0b]"
          : s === "succeeded"
            ? "text-[#666666]"
            : "text-[#666666]";

  return <span className={`text-xs font-mono font-semibold ${color}`}>{status}</span>;
}
