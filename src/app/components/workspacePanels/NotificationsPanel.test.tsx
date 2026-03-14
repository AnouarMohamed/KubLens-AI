import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { K8sEvent } from "../../../types";
import { DEFAULT_SETTINGS } from "../../hooks/useUserSettings";
import { NotificationsPanel } from "./NotificationsPanel";

function notificationRows(): K8sEvent[] {
  return [
    {
      type: "Warning",
      reason: "BackOff",
      age: "1m",
      from: "kubelet",
      message: "container restart loop",
      lastTimestamp: "2026-03-14T01:00:00Z",
    },
    {
      type: "Normal",
      reason: "Scheduled",
      age: "2m",
      from: "scheduler",
      message: "pod scheduled to node-a",
      lastTimestamp: "2026-03-14T00:58:00Z",
    },
  ];
}

describe("NotificationsPanel", () => {
  it("marks notifications as read on mount", () => {
    const markNotificationsRead = vi.fn();

    render(
      <NotificationsPanel
        notifications={notificationRows()}
        notificationError={null}
        notificationStatus="live"
        notificationLastUpdatedAt={null}
        notificationUnreadCount={3}
        notificationSuppressedCount={0}
        notificationSignal={{ totalLast5Minutes: 2, warningLast10Minutes: 1, burstDetected: false }}
        markNotificationsRead={markNotificationsRead}
        clearNotifications={vi.fn()}
        openEventsView={vi.fn()}
        onAuthMessage={vi.fn()}
        settings={{ ...DEFAULT_SETTINGS, warningOnlyNotifications: false }}
      />,
    );

    expect(markNotificationsRead).toHaveBeenCalledTimes(1);
  });

  it("reacts to warning-only settings changes", async () => {
    const baseProps = {
      notifications: notificationRows(),
      notificationError: null,
      notificationStatus: "live" as const,
      notificationLastUpdatedAt: null,
      notificationUnreadCount: 0,
      notificationSuppressedCount: 0,
      notificationSignal: { totalLast5Minutes: 2, warningLast10Minutes: 1, burstDetected: false },
      markNotificationsRead: vi.fn(),
      clearNotifications: vi.fn(),
      openEventsView: vi.fn(),
      onAuthMessage: vi.fn(),
    };

    const { rerender } = render(
      <NotificationsPanel
        {...baseProps}
        settings={{ ...DEFAULT_SETTINGS, warningOnlyNotifications: true, relativeTimestamps: false }}
      />,
    );

    expect(screen.getByText("BackOff")).toBeInTheDocument();
    expect(screen.queryByText("Scheduled")).not.toBeInTheDocument();

    rerender(
      <NotificationsPanel
        {...baseProps}
        settings={{ ...DEFAULT_SETTINGS, warningOnlyNotifications: false, relativeTimestamps: false }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Scheduled")).toBeInTheDocument();
    });
  });
});
