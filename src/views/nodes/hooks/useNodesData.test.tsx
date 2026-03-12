import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNodesData } from "./useNodesData";

const mockAPI = vi.hoisted(() => ({
  getNodes: vi.fn(),
  getEvents: vi.fn(),
  getAlertLifecycle: vi.fn(),
  getNodeDetail: vi.fn(),
  getNodePods: vi.fn(),
  getNodeEvents: vi.fn(),
  cordonNode: vi.fn(),
  uncordonNode: vi.fn(),
  previewNodeDrain: vi.fn(),
  drainNode: vi.fn(),
  dispatchAlert: vi.fn(),
  updateAlertLifecycle: vi.fn(),
}));

vi.mock("../../../lib/api", () => ({
  api: mockAPI,
}));

vi.mock("../../../context/AuthSessionContext", () => ({
  useAuthSession: () => ({
    can: (permission: string) => permission === "read" || permission === "write",
    isLoading: false,
  }),
}));

vi.mock("../../../app/hooks/useStreamRefresh", () => ({
  useStreamRefresh: vi.fn(),
}));

describe("useNodesData", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAPI.getNodes.mockResolvedValue([
      {
        name: "node-master-1",
        status: "Ready",
        roles: "control-plane",
        age: "4d",
        version: "v1.30.0",
        cpuUsage: "35%",
        memUsage: "42%",
      },
    ]);
    mockAPI.getEvents.mockResolvedValue([]);
    mockAPI.getAlertLifecycle.mockResolvedValue([]);
    mockAPI.previewNodeDrain.mockResolvedValue({
      node: "node-master-1",
      evictable: [{ namespace: "default", name: "api" }],
      skipped: [],
      blockers: [],
      safeToDrain: true,
      generatedAt: "2026-03-12T12:00:00Z",
    });
    mockAPI.drainNode.mockResolvedValue({
      success: true,
      message: "Node node-master-1 drained.",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("puts preview summaries into notice state", async () => {
    const { result } = renderHook(() => useNodesData());

    await waitFor(() => {
      expect(result.current.nodes).toHaveLength(1);
    });

    await act(async () => {
      await result.current.previewDrain("node-master-1");
    });

    expect(result.current.error).toBeNull();
    expect(result.current.notice).toContain("Drain preview:");
  });

  it("sends force drain reason through API payload", async () => {
    mockAPI.previewNodeDrain.mockResolvedValue({
      node: "node-master-1",
      evictable: [{ namespace: "default", name: "api" }],
      skipped: [],
      blockers: [{ kind: "pdb", message: "blocked", pod: { namespace: "kube-system", name: "critical" } }],
      safeToDrain: false,
      generatedAt: "2026-03-12T12:00:00Z",
    });

    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("Emergency maintenance window");

    const { result } = renderHook(() => useNodesData());

    await waitFor(() => {
      expect(result.current.nodes).toHaveLength(1);
    });

    await act(async () => {
      await result.current.drain("node-master-1", { force: true });
    });

    expect(promptSpy).toHaveBeenCalled();
    expect(mockAPI.drainNode).toHaveBeenCalledWith("node-master-1", {
      force: true,
      reason: "Emergency maintenance window",
    });
    expect(result.current.notice).toContain("drained");
    expect(result.current.error).toBeNull();
  });
});
