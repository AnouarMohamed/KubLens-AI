import type { Pod } from "../../../types";

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
    { label: "Visible Pods", value: filteredCount },
    { label: "Running", value: totals.running },
    { label: "Pending", value: totals.pending },
    { label: "Failed", value: totals.failed },
    { label: "Restarts", value: pods.reduce((sum, pod) => sum + pod.restarts, 0) },
  ];

  return (
    <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <article key={card.label} className="kpi">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-100">{card.value}</p>
        </article>
      ))}
    </section>
  );
}
