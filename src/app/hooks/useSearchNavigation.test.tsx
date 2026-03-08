import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSearchNavigation } from "./useSearchNavigation";

describe("useSearchNavigation", () => {
  it("opens matched views and clears query", () => {
    const setCurrentView = vi.fn();
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useSearchNavigation({
        items: [{ id: "pods", label: "Pods", description: "pods", kubectlCommand: "kubectl get pods -A" }],
        setCurrentView,
        onMessage,
      }),
    );

    act(() => {
      result.current.setSearch("pods");
    });
    act(() => {
      result.current.submitSearch();
    });

    expect(setCurrentView).toHaveBeenCalledWith("pods");
    expect(onMessage).toHaveBeenCalledWith("Opened Pods.");
    expect(result.current.search).toBe("");
  });

  it("reports when requested view is not accessible", () => {
    const setCurrentView = vi.fn();
    const onMessage = vi.fn();
    const { result } = renderHook(() =>
      useSearchNavigation({
        items: [{ id: "pods", label: "Pods", description: "pods", kubectlCommand: "kubectl get pods -A" }],
        setCurrentView,
        onMessage,
      }),
    );

    act(() => {
      result.current.setSearch("not-a-real-view");
    });
    act(() => {
      result.current.submitSearch();
    });

    expect(setCurrentView).not.toHaveBeenCalled();
    expect(onMessage).toHaveBeenCalledWith("No matching section found.");
  });
});
