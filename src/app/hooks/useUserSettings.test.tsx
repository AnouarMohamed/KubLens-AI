import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { DEFAULT_SETTINGS, useUserSettings } from "./useUserSettings";

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
      result.current.setSettings({ denseMode: true, autoRefreshSeconds: 45 });
    });

    await waitFor(() => {
      expect(window.localStorage.getItem("k8s-ops.settings.v1")).toContain('"denseMode":true');
    });
  });
});
