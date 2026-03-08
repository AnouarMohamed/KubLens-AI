import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { blockedViewMessage, useViewAccess } from "./useViewAccess";
import type { RuntimeStatus } from "../../types";

describe("useViewAccess", () => {
  it("hides terminal when runtime terminal flag is off", () => {
    const { result } = renderHook(() =>
      useViewAccess({
        canTerminal: true,
        canAssist: true,
        runtime: {
          mode: "prod",
          devMode: false,
          insecure: false,
          isRealCluster: true,
          authEnabled: true,
          writeActionsEnabled: false,
          terminalEnabled: false,
          predictorEnabled: true,
          predictorHealthy: true,
          assistantEnabled: true,
          ragEnabled: true,
          alertsEnabled: true,
          warnings: [],
        },
      }),
    );

    const terminalVisible = result.current.sections.some((section) =>
      section.items.some((item) => item.id === "terminal"),
    );
    expect(terminalVisible).toBe(false);
  });

  it("shows terminal when permission and runtime allow it", () => {
    const { result } = renderHook(() =>
      useViewAccess({
        canTerminal: true,
        canAssist: true,
        runtime: {
          mode: "dev",
          devMode: true,
          insecure: true,
          isRealCluster: false,
          authEnabled: true,
          writeActionsEnabled: true,
          terminalEnabled: true,
          predictorEnabled: false,
          predictorHealthy: true,
          assistantEnabled: true,
          ragEnabled: true,
          alertsEnabled: false,
          warnings: [],
        },
      }),
    );

    expect(result.current.isAllowed("terminal")).toBe(true);
  });
});

describe("blockedViewMessage", () => {
  it("returns explicit terminal disabled reason", () => {
    const runtime: RuntimeStatus = {
      mode: "demo",
      devMode: false,
      insecure: true,
      isRealCluster: false,
      authEnabled: false,
      writeActionsEnabled: false,
      terminalEnabled: false,
      predictorEnabled: false,
      predictorHealthy: true,
      assistantEnabled: false,
      ragEnabled: true,
      alertsEnabled: false,
      warnings: [],
    };
    expect(blockedViewMessage("terminal", runtime)).toContain("disabled");
  });
});
