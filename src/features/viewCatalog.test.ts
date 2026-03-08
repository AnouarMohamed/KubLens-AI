import { describe, expect, it } from "vitest";
import { VIEW_SECTIONS, filterSectionsByPolicy, flattenViewItems } from "./viewCatalog";

describe("viewCatalog access policy", () => {
  it("removes terminal and assistant when disabled by policy", () => {
    const filtered = filterSectionsByPolicy(VIEW_SECTIONS, {
      assistantEnabled: false,
      terminalEnabled: false,
    });
    const items = flattenViewItems(filtered);
    expect(items.some((item) => item.id === "assistant")).toBe(false);
    expect(items.some((item) => item.id === "terminal")).toBe(false);
  });
});
