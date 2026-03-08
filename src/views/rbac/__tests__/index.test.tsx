import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RBAC from "../index";

const mockAPI = vi.hoisted(() => ({
  getResources: vi.fn(),
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

describe("RBAC view", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockAuth.can.mockReturnValue(true);
  });

  it("renders RBAC inventory with kind labels", async () => {
    mockAPI.getResources.mockResolvedValue({
      kind: "rbac",
      items: [
        {
          id: "role-default-read",
          name: "default-read",
          namespace: "default",
          status: "Role",
          age: "12h",
          summary: "rules: 2",
        },
      ],
    });

    render(<RBAC />);

    await waitFor(() => {
      expect(screen.getByText("default-read")).toBeInTheDocument();
      expect(screen.getAllByText("Role").length).toBeGreaterThan(0);
    });
  });
});
