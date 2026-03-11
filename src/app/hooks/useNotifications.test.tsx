import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useNotifications } from "./useNotifications";

const mockAPI = vi.hoisted(() => ({
  getEvents: vi.fn(),
  getStreamWSURL: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  api: mockAPI,
}));

const baseEvent = {
  type: "Warning",
  reason: "BackOff",
  age: "1m",
  from: "kubelet",
  message: "Container restart loop",
};

describe("useNotifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("blocks notification access when read permission is missing", () => {
    const { result } = renderHook(() =>
      useNotifications({
        panel: "none",
        authLoading: false,
        canRead: false,
        canStream: false,
        autoRefreshSeconds: 30,
        notificationLimit: 20,
        liveNotificationsEnabled: true,
        desktopNotificationsEnabled: false,
      }),
    );

    expect(result.current.notificationStatus).toBe("blocked");
    expect(result.current.notificationError).toBe("Authenticate first to access notifications.");
    expect(result.current.notifications).toEqual([]);
  });

  it("loads snapshots and tracks unread events until panel is opened", async () => {
    const secondSnapshot = [
      {
        ...baseEvent,
        reason: "FailedMount",
        message: "Volume mount failed",
        age: "0m",
      },
      baseEvent,
    ];
    type Props = { panel: "none" | "notifications"; autoRefreshSeconds: number };

    mockAPI.getEvents
      .mockResolvedValue(secondSnapshot)
      .mockResolvedValueOnce([baseEvent])
      .mockResolvedValueOnce(secondSnapshot);

    const { result, rerender } = renderHook(
      ({ panel, autoRefreshSeconds }: Props) =>
        useNotifications({
          panel,
          authLoading: false,
          canRead: true,
          canStream: false,
          autoRefreshSeconds,
          notificationLimit: 20,
          liveNotificationsEnabled: true,
          desktopNotificationsEnabled: false,
        }),
      {
        initialProps: { panel: "none", autoRefreshSeconds: 10 } as Props,
      },
    );

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(1);
    });
    expect(result.current.notificationStatus).toBe("snapshot");
    expect(result.current.notificationUnreadCount).toBe(0);

    rerender({ panel: "none", autoRefreshSeconds: 11 });

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(2);
      expect(result.current.notificationUnreadCount).toBe(1);
    });

    rerender({ panel: "notifications", autoRefreshSeconds: 11 });
    await waitFor(() => {
      expect(result.current.notificationUnreadCount).toBe(0);
    });
  });
});
