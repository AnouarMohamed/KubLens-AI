import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useClusterContexts } from "./useClusterContexts";

const mockAPI = vi.hoisted(() => ({
  getClusters: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  api: mockAPI,
}));

describe("useClusterContexts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does not fetch while loading or without read permission", () => {
    renderHook(() => useClusterContexts({ authLoading: true, canRead: true }));
    renderHook(() => useClusterContexts({ authLoading: false, canRead: false }));
    expect(mockAPI.getClusters).not.toHaveBeenCalled();
  });

  it("loads contexts when readable", async () => {
    mockAPI.getClusters.mockResolvedValue({
      selected: "default",
      items: [{ name: "default", isRealCluster: false }],
    });

    const { result } = renderHook(() => useClusterContexts({ authLoading: false, canRead: true }));
    await waitFor(() => {
      expect(result.current.clusterContexts?.selected).toBe("default");
    });
  });
});
