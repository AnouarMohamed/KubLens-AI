import type { NodeDetail } from "../../../types";
import { InfoCard } from "./InfoCard";
import { SignalCard } from "./SignalCard";
import { estimateMinutesToThreshold, parsePercent } from "./utils";

interface NodeOverviewProps {
  selectedNode: NodeDetail;
}

export function NodeOverview({ selectedNode }: NodeOverviewProps) {
  const currentCPU = parsePercent(selectedNode.cpuUsage);
  const currentMemory = parsePercent(selectedNode.memUsage);
  const cpuHeadroom = Math.max(0, 100 - currentCPU);
  const memoryHeadroom = Math.max(0, 100 - currentMemory);
  const cpuProjection = estimateMinutesToThreshold(selectedNode.cpuHistory ?? [], 85, 2);

  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Capacity and risk trend</p>
      <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <InfoCard label="CPU" capacity={selectedNode.capacity.cpu} allocatable={selectedNode.allocatable.cpu} />
        <InfoCard
          label="Memory"
          capacity={selectedNode.capacity.memory}
          allocatable={selectedNode.allocatable.memory}
        />
        <InfoCard label="Pods" capacity={selectedNode.capacity.pods} allocatable={selectedNode.allocatable.pods} />
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <SignalCard
          title="CPU headroom"
          value={`${cpuHeadroom.toFixed(1)}%`}
          note={`Current usage ${selectedNode.cpuUsage}`}
          tone={cpuHeadroom < 20 ? "warning" : "normal"}
        />
        <SignalCard
          title="Memory headroom"
          value={`${memoryHeadroom.toFixed(1)}%`}
          note={`Current usage ${selectedNode.memUsage}`}
          tone={memoryHeadroom < 20 ? "warning" : "normal"}
        />
        <SignalCard
          title="CPU risk trend"
          value={cpuProjection.message}
          note={cpuProjection.detail}
          tone={cpuProjection.tone}
        />
      </div>
    </section>
  );
}
