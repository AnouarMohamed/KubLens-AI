import type { Node } from "../../../types";
import { KpiStrip } from "../../../components/KpiStrip";

function parsePercent(raw: string): number {
  const value = Number.parseFloat(raw.replace("%", ""));
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 100);
}

export function NodesSummary({ nodes, filteredCount }: { nodes: Node[]; filteredCount: number }) {
  const ready = nodes.filter((node) => node.status === "Ready").length;
  const notReady = nodes.length - ready;
  const avgCPU =
    nodes.length > 0 ? nodes.reduce((sum, node) => sum + parsePercent(node.cpuUsage), 0) / nodes.length : 0;
  const avgMemory =
    nodes.length > 0 ? nodes.reduce((sum, node) => sum + parsePercent(node.memUsage), 0) / nodes.length : 0;

  const cards = [
    { label: "Visible Nodes", value: filteredCount, tone: "default" as const },
    { label: "Ready", value: ready, tone: "healthy" as const },
    { label: "NotReady", value: notReady, tone: notReady > 0 ? ("critical" as const) : ("default" as const) },
    {
      label: "Avg CPU",
      value: `${avgCPU.toFixed(1)}%`,
      tone: avgCPU >= 80 ? ("warning" as const) : ("default" as const),
    },
    {
      label: "Avg Memory",
      value: `${avgMemory.toFixed(1)}%`,
      tone: avgMemory >= 80 ? ("warning" as const) : ("default" as const),
    },
  ];

  return <KpiStrip items={cards} className="lg:grid-cols-5" />;
}
