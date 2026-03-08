import type { ResourceRecord } from "../../../types";

export function ResourceCatalogSummary({
  resources,
  filteredCount,
}: {
  resources: ResourceRecord[];
  filteredCount: number;
}) {
  const namespaces = new Set(resources.map((item) => item.namespace).filter(Boolean)).size;
  const withWarnings = resources.filter((item) => item.status.toLowerCase().includes("warning")).length;
  const withErrors = resources.filter((item) => item.status.toLowerCase().includes("error")).length;

  const cards = [
    { label: "Visible", value: filteredCount },
    { label: "Total", value: resources.length },
    { label: "Namespaces", value: namespaces },
    { label: "Warnings", value: withWarnings },
    { label: "Errors", value: withErrors },
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
