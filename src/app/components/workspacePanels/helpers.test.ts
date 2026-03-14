import { describe, expect, it } from "vitest";
import type { K8sEvent } from "../../../types";
import {
  formatAuthErrorMessage,
  normalizeKeywordInput,
  notificationTone,
  sanitizeAuthTokenInput,
  topNotificationReasons,
} from "./helpers";

describe("workspace panel helpers", () => {
  it("normalizes bearer token input and rejects bearer-only values", () => {
    expect(sanitizeAuthTokenInput("  Bearer abc123  ")).toBe("abc123");
    expect(sanitizeAuthTokenInput("bearer\tsecret-token")).toBe("secret-token");
    expect(sanitizeAuthTokenInput("Bearer")).toBe("");
    expect(sanitizeAuthTokenInput("   ")).toBe("");
  });

  it("handles notification tone defensively", () => {
    expect(notificationTone("Warning")).toBe("warning");
    expect(notificationTone("Normal")).toBe("normal");
    expect(notificationTone(undefined)).toBe("other");
    expect(notificationTone(null)).toBe("other");
  });

  it("deduplicates and bounds muted keyword input", () => {
    const tooLongKeyword = `too-long-${"x".repeat(80)}`;
    expect(normalizeKeywordInput(` BackOff, imagepullbackoff, BACKOFF,  , ${tooLongKeyword}`)).toEqual([
      "backoff",
      "imagepullbackoff",
    ]);
  });

  it("returns top repeated notification reasons", () => {
    const rows = [
      { type: "Warning", reason: "BackOff", age: "1m", from: "kubelet", message: "loop" },
      { type: "Warning", reason: "BackOff", age: "1m", from: "kubelet", message: "loop" },
      { type: "Normal", reason: "FailedMount", age: "1m", from: "scheduler", message: "wait" },
      { type: "Normal", reason: "", age: "1m", from: "scheduler", message: "skip" },
    ] satisfies K8sEvent[];
    expect(topNotificationReasons(rows, 2)).toEqual([
      { reason: "BackOff", count: 2 },
      { reason: "FailedMount", count: 1 },
    ]);
  });

  it("formats auth rate-limit errors with lockout guidance", () => {
    expect(formatAuthErrorMessage({ status: 429, message: "Too many attempts." })).toContain(
      "Wait before retrying to avoid lockout.",
    );
  });
});
