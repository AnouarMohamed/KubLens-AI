import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Namespaces from "../index";

const mockAPI = vi.hoisted(() => ({
  getResources: vi.fn(),
  getPods: vi.fn(),
}));

const mockAuth = vi.hoisted(() => ({
  can: vi.fn(),
  isLoading: false,
}));

vi.mock("../../../lib/api", () => ({
  api: mockAPI,
}));

vi.mock("../../../context/AuthSessionContext", () => ({
  useAuthSession: () => mockAuth,
}));

describe("Namespaces view", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.can.mockReturnValue(true);
  });

  it("aggregates pod totals per namespace", async () => {
    mockAPI.getResources.mockResolvedValue({
      kind: "namespaces",
      items: [
        { id: "ns-default", name: "default", status: "Active", age: "1d" },
        { id: "ns-prod", name: "production", status: "Active", age: "2d" },
      ],
    });
    mockAPI.getPods.mockResolvedValue([
      {
        id: "p1",
        name: "api",
        namespace: "default",
        status: "Running",
        cpu: "100m",
        memory: "128Mi",
        age: "1m",
        restarts: 0,
      },
      {
        id: "p2",
        name: "worker",
        namespace: "production",
        status: "Failed",
        cpu: "200m",
        memory: "256Mi",
        age: "2m",
        restarts: 1,
      },
    ]);

    render(<Namespaces />);

    await waitFor(() => {
      expect(screen.getByText("default")).toBeInTheDocument();
      expect(screen.getByText("production")).toBeInTheDocument();
      expect(screen.getByText("Tracked Pods")).toBeInTheDocument();
    });
  });
});
