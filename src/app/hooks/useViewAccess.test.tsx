import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { blockedViewMessage, useViewAccess } from "./useViewAccess";

describe("useViewAccess", () => {
  it("hides assistant when permission is missing", () => {
    const { result } = renderHook(() =>
      useViewAccess({
        canAssist: false,
      }),
    );

    const assistantVisible = result.current.sections.some((section) =>
      section.items.some((item) => item.id === "assistant"),
    );
    expect(assistantVisible).toBe(false);
  });

  it("shows assistant when permission is present", () => {
    const { result } = renderHook(() =>
      useViewAccess({
        canAssist: true,
      }),
    );

    expect(result.current.isAllowed("assistant")).toBe(true);
  });
});

describe("blockedViewMessage", () => {
  it("returns explicit assistant access message", () => {
    expect(blockedViewMessage("assistant")).toContain("authenticated session");
  });
});
