import type { ResourceRecord } from "../../../types";

function isHealthyStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return normalized.includes("ready") || normalized.includes("active") || normalized.includes("running");
}

export function DeploymentSummary({ items, filteredCount }: { items: ResourceRecord[]; filteredCount: number }) {
  const healthy = items.filter((item) => isHealthyStatus(item.status)).length;
  const unhealthy = Math.max(items.length - healthy, 0);
  const namespaces = new Set(items.map((item) => item.namespace).filter(Boolean)).size;

  const cards = [
    { label: "Visible", value: filteredCount },
    { label: "Total", value: items.length },
    { label: "Healthy", value: healthy },
    { label: "At Risk", value: unhealthy },
    { label: "Namespaces", value: namespaces },
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
