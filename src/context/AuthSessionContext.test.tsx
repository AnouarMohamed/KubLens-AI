import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthSessionProvider, useAuthSession } from "./AuthSessionContext";

const mockAPI = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  api: mockAPI,
}));

function Probe() {
  const { session, can, login, logout } = useAuthSession();
  return (
    <div>
      <p data-testid="role">{session?.user?.role ?? "none"}</p>
      <p data-testid="can-read">{String(can("read"))}</p>
      <p data-testid="can-terminal">{String(can("terminal"))}</p>
      <button onClick={() => void login("admin-token")}>login</button>
      <button onClick={() => void logout()}>logout</button>
    </div>
  );
}

describe("AuthSessionProvider", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("loads session and exposes permissions", async () => {
    mockAPI.getAuthSession.mockResolvedValue({
      enabled: true,
      authenticated: true,
      user: { name: "admin", role: "admin" },
      permissions: ["read", "write", "terminal"],
    });

    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("role")).toHaveTextContent("admin");
      expect(screen.getByTestId("can-read")).toHaveTextContent("true");
      expect(screen.getByTestId("can-terminal")).toHaveTextContent("true");
    });
  });

  it("updates state on login and logout", async () => {
    mockAPI.getAuthSession.mockResolvedValue({
      enabled: true,
      authenticated: false,
      permissions: [],
    });
    mockAPI.login.mockResolvedValue({
      enabled: true,
      authenticated: true,
      user: { name: "operator", role: "operator" },
      permissions: ["read", "write"],
    });
    mockAPI.logout.mockResolvedValue({
      enabled: true,
      authenticated: false,
      permissions: [],
    });

    const user = userEvent.setup();
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("role")).toHaveTextContent("none");
    });

    await user.click(screen.getByText("login"));
    await waitFor(() => {
      expect(screen.getByTestId("role")).toHaveTextContent("operator");
    });

    await user.click(screen.getByText("logout"));
    await waitFor(() => {
      expect(screen.getByTestId("role")).toHaveTextContent("none");
    });
  });
});
