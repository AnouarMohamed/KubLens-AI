import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { DEFAULT_SETTINGS, normalizeUserSettings, useUserSettings } from "./useUserSettings";

describe("useUserSettings", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("uses defaults when no storage exists", () => {
    const { result } = renderHook(() => useUserSettings());
    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("persists updated settings", async () => {
    const { result } = renderHook(() => useUserSettings());
    act(() => {
      result.current.setSettings({
        denseMode: true,
        autoRefreshSeconds: 45,
        panelWidth: "xwide",
        relativeTimestamps: false,
        liveNotifications: false,
        notificationLimit: 42,
        warningOnlyNotifications: true,
        desktopNotifications: true,
      });
    });

    await waitFor(() => {
      expect(window.localStorage.getItem("k8s-ops.settings.v1")).toBe(
        '{"denseMode":true,"autoRefreshSeconds":45,"panelWidth":"xwide","relativeTimestamps":false,"liveNotifications":false,"notificationLimit":42,"warningOnlyNotifications":true,"desktopNotifications":true}',
      );
    });
  });

  it("normalizes malformed stored settings", () => {
    window.localStorage.setItem(
      "k8s-ops.settings.v1",
      '{"denseMode":"yes","autoRefreshSeconds":1,"panelWidth":"huge","notificationLimit":999}',
    );

    const { result } = renderHook(() => useUserSettings());
    expect(result.current.settings).toEqual({
      ...DEFAULT_SETTINGS,
      autoRefreshSeconds: 10,
      notificationLimit: 60,
    });
  });

  it("resets settings back to defaults", () => {
    const { result } = renderHook(() => useUserSettings());
    act(() => {
      result.current.setSettings({
        ...DEFAULT_SETTINGS,
        denseMode: true,
        panelWidth: "xwide",
      });
    });
    act(() => {
      result.current.resetSettings();
    });

    expect(result.current.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("normalizes unknown input payloads", () => {
    expect(normalizeUserSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeUserSettings("invalid")).toEqual(DEFAULT_SETTINGS);
  });
});
