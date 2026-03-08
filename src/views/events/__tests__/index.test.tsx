import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Events from "../index";

const mockAPI = vi.hoisted(() => ({
  getEvents: vi.fn(),
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

describe("Events view", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.can.mockReturnValue(true);
  });

  it("renders event rows from API", async () => {
    mockAPI.getEvents.mockResolvedValue([
      {
        type: "Warning",
        reason: "BackOff",
        age: "1m",
        from: "kubelet",
        message: "container restarted repeatedly",
        count: 2,
      },
    ]);

    render(<Events />);

    await waitFor(() => {
      expect(screen.getByText("BackOff")).toBeInTheDocument();
      expect(screen.getByText("container restarted repeatedly")).toBeInTheDocument();
    });
  });
});
