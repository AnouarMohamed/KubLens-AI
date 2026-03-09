import type { Pod } from "../../../types";
import { KpiStrip } from "../../../components/KpiStrip";

export function PodsSummary({ pods, filteredCount }: { pods: Pod[]; filteredCount: number }) {
  const totals = pods.reduce(
    (acc, pod) => {
      acc.total += 1;
      const key = pod.status.toLowerCase() as "running" | "pending" | "failed" | "succeeded" | "unknown";
      if (key in acc) {
        acc[key] += 1;
      }
      return acc;
    },
    { total: 0, running: 0, pending: 0, failed: 0, succeeded: 0, unknown: 0 },
  );

  const cards = [
    { label: "Visible Pods", value: filteredCount, tone: "default" as const },
    { label: "Running", value: totals.running, tone: "healthy" as const },
    { label: "Pending", value: totals.pending, tone: totals.pending > 0 ? ("warning" as const) : ("default" as const) },
    { label: "Failed", value: totals.failed, tone: totals.failed > 0 ? ("critical" as const) : ("default" as const) },
    {
      label: "Restarts",
      value: pods.reduce((sum, pod) => sum + pod.restarts, 0),
      tone: pods.some((pod) => pod.restarts > 0) ? ("warning" as const) : ("default" as const),
    },
  ];

  return <KpiStrip items={cards} className="lg:grid-cols-5" />;
}
