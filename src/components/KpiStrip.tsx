interface KpiItem {
  label: string;
  value: string | number;
  tone?: "default" | "warning" | "critical" | "healthy";
}

interface KpiStripProps {
  items: KpiItem[];
  className?: string;
}

export function KpiStrip({ items, className = "" }: KpiStripProps) {
  return (
    <section className={`kpi-strip ${className}`.trim()}>
      {items.map((item, index) => (
        <article key={`${item.label}-${index}`} className="kpi">
          <p className="kpi-label">{item.label}</p>
          <p className={`kpi-value ${toneClass(item.tone)}`.trim()}>{item.value}</p>
        </article>
      ))}
    </section>
  );
}

function toneClass(tone: KpiItem["tone"]): string {
  if (tone === "critical") {
    return "kpi-value-critical";
  }
  if (tone === "warning") {
    return "kpi-value-warning";
  }
  if (tone === "healthy") {
    return "kpi-value-healthy";
  }
  return "";
}
