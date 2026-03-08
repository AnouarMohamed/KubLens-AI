interface MetricsKPI {
  label: string;
  value: string;
}

export function MetricsKpiStrip({ items }: { items: MetricsKPI[] }) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
      {items.map((item) => (
        <article key={item.label} className="kpi">
          <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">{item.label}</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-100">{item.value}</p>
        </article>
      ))}
    </section>
  );
}
