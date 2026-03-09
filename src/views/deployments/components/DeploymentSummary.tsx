import type { ResourceRecord } from "../../../types";
import { KpiStrip } from "../../../components/KpiStrip";

function isHealthyStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return normalized.includes("ready") || normalized.includes("active") || normalized.includes("running");
}

export function DeploymentSummary({ items, filteredCount }: { items: ResourceRecord[]; filteredCount: number }) {
  const healthy = items.filter((item) => isHealthyStatus(item.status)).length;
  const unhealthy = Math.max(items.length - healthy, 0);
  const namespaces = new Set(items.map((item) => item.namespace).filter(Boolean)).size;

  const cards = [
    { label: "Visible", value: filteredCount, tone: "default" as const },
    { label: "Total", value: items.length, tone: "default" as const },
    { label: "Healthy", value: healthy, tone: "healthy" as const },
    { label: "At Risk", value: unhealthy, tone: unhealthy > 0 ? ("critical" as const) : ("default" as const) },
    { label: "Namespaces", value: namespaces, tone: "default" as const },
  ];

  return <KpiStrip items={cards} className="lg:grid-cols-5" />;
}
