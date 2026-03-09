import type { RuntimeStatus } from "../../types";

export function ModeBanner({ runtime }: { runtime: RuntimeStatus | null }) {
  if (!runtime) {
    return null;
  }

  const warnings = [...runtime.warnings];
  if (!runtime.predictorHealthy && runtime.predictorEnabled) {
    warnings.push(
      runtime.predictorLastError
        ? `Predictor degraded: ${runtime.predictorLastError}`
        : "Predictor degraded: fallback mode active.",
    );
  }

  if (!runtime.insecure && warnings.length === 0) {
    return null;
  }

  const resolvedWarnings =
    warnings.length > 0 ? warnings : ["Security-sensitive features are restricted in this mode."];

  return (
    <div className="border-b border-zinc-700 bg-zinc-900 px-6 py-2 text-xs">
      <p className="font-semibold uppercase tracking-[0.14em] text-[var(--amber)]">
        {runtime.mode.toUpperCase()} Mode Warning
      </p>
      <p className="mt-0.5 text-zinc-300 prose-text">{resolvedWarnings.join(" ")}</p>
    </div>
  );
}
