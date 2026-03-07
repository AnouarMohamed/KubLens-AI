import type { RuntimeStatus } from "../../types";

export function ModeBanner({ runtime }: { runtime: RuntimeStatus | null }) {
  if (!runtime || !runtime.insecure) {
    return null;
  }

  const warnings =
    runtime.warnings.length > 0 ? runtime.warnings : ["Security-sensitive features are restricted in this mode."];

  return (
    <div className="border-b border-amber-300/40 bg-amber-300/20 px-6 py-2 text-xs text-zinc-900">
      <p className="font-semibold uppercase tracking-wide">{runtime.mode.toUpperCase()} Mode Warning</p>
      <p className="mt-0.5">{warnings.join(" ")}</p>
    </div>
  );
}
