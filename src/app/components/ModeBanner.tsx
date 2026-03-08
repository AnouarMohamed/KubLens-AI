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
    <div className="border-b border-amber-300 bg-amber-100 px-6 py-2 text-xs text-amber-950">
      <p className="font-semibold uppercase tracking-wide">{runtime.mode.toUpperCase()} Mode Warning</p>
      <p className="mt-0.5 text-amber-900">{resolvedWarnings.join(" ")}</p>
    </div>
  );
}
