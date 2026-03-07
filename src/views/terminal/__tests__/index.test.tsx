import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import Terminal from "../index";
import { AuthSessionProvider } from "../../../context/AuthSessionContext";

const mockAPI = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  execTerminal: vi.fn(),
}));

vi.mock("../../../lib/api", () => ({
  api: mockAPI,
}));

describe("Terminal view", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows restricted message when terminal permission is missing", async () => {
    mockAPI.getAuthSession.mockResolvedValue({
      enabled: true,
      authenticated: true,
      user: { name: "viewer", role: "viewer" },
      permissions: ["read"],
    });

    render(
      <AuthSessionProvider>
        <Terminal />
      </AuthSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Terminal Access Restricted")).toBeInTheDocument();
    });
  });
});
