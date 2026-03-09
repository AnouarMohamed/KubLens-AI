import { KpiStrip } from "../../../components/KpiStrip";

interface MetricsKPI {
  label: string;
  value: string;
}

export function MetricsKpiStrip({ items }: { items: MetricsKPI[] }) {
  const mapped = items.map((item) => ({
    ...item,
    tone: toneFromMetric(item.label, item.value),
  }));

  return <KpiStrip items={mapped} className="md:grid-cols-2 xl:grid-cols-6" />;
}

function toneFromMetric(label: string, value: string): "default" | "warning" | "critical" | "healthy" {
  const normalizedLabel = label.toLowerCase();
  const numeric = Number.parseFloat(value.replace(/[^\d.]/g, ""));

  if (Number.isNaN(numeric)) {
    return "default";
  }

  if (normalizedLabel.includes("error")) {
    if (numeric >= 10) {
      return "critical";
    }
    if (numeric >= 3) {
      return "warning";
    }
  }

  if (normalizedLabel.includes("latency") && numeric >= 250) {
    return "warning";
  }

  return "default";
}
