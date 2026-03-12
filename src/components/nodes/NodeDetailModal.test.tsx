import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import NodeDetailModal from "./NodeDetailModal";
import type { NodeDetail, NodeDrainPreview } from "../../types";

const selectedNode: NodeDetail = {
  name: "node-master-1",
  status: "Ready",
  roles: "control-plane",
  unschedulable: true,
  age: "4d",
  version: "v1.30.0",
  cpuUsage: "30%",
  memUsage: "42%",
  cpuHistory: [
    { time: "10:00", value: 20 },
    { time: "10:02", value: 25 },
  ],
  capacity: { cpu: "8", memory: "32Gi", pods: "110" },
  allocatable: { cpu: "7.5", memory: "30Gi", pods: "110" },
  conditions: [],
  addresses: [],
};

const previewWithBlockers: NodeDrainPreview = {
  node: "node-master-1",
  evictable: [{ namespace: "default", name: "api" }],
  skipped: [],
  blockers: [{ kind: "pdb", message: "blocked", pod: { namespace: "kube-system", name: "critical" } }],
  safeToDrain: false,
  generatedAt: "2026-03-12T12:00:00Z",
};

describe("NodeDetailModal", () => {
  it("routes maintenance force drain action with force option", async () => {
    const user = userEvent.setup();
    const onDrain = vi.fn().mockResolvedValue(undefined);

    render(
      <NodeDetailModal
        selectedNode={selectedNode}
        nodePods={[
          {
            id: "1",
            namespace: "default",
            name: "api",
            status: "Running",
            cpu: "10m",
            memory: "64Mi",
            age: "5m",
            restarts: 0,
          },
        ]}
        nodeEvents={[]}
        lastDrainPreview={previewWithBlockers}
        isBusy={false}
        onCordon={vi.fn().mockResolvedValue(undefined)}
        onUncordon={vi.fn().mockResolvedValue(undefined)}
        onPreviewDrain={vi.fn().mockResolvedValue(undefined)}
        onDrain={onDrain}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Maintenance" }));
    await user.click(screen.getByRole("button", { name: "Force Drain" }));

    expect(onDrain).toHaveBeenCalledWith("node-master-1", { force: true });
  });
});
