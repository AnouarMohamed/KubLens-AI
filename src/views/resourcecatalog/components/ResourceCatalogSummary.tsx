import type { ResourceRecord } from "../../../types";
import { KpiStrip } from "../../../components/KpiStrip";

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
    { label: "Visible", value: filteredCount, tone: "default" as const },
    { label: "Total", value: resources.length, tone: "default" as const },
    { label: "Namespaces", value: namespaces, tone: "default" as const },
    { label: "Warnings", value: withWarnings, tone: withWarnings > 0 ? ("warning" as const) : ("default" as const) },
    { label: "Errors", value: withErrors, tone: withErrors > 0 ? ("critical" as const) : ("default" as const) },
  ];

  return <KpiStrip items={cards} className="lg:grid-cols-5" />;
}
