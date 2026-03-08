import type { Node } from "../../../types";

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
    { label: "Visible Nodes", value: filteredCount },
    { label: "Ready", value: ready },
    { label: "NotReady", value: notReady },
    { label: "Avg CPU", value: `${avgCPU.toFixed(1)}%` },
    { label: "Avg Memory", value: `${avgMemory.toFixed(1)}%` },
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
