import { describe, expect, it } from "vitest";
import { apiRoute } from "./core";

describe("apiRoute", () => {
  it("builds static OpenAPI routes", () => {
    expect(apiRoute("/healthz")).toBe("/api/healthz");
  });

  it("replaces and encodes path parameters", () => {
    expect(apiRoute("/pods/{namespace}/{name}", { namespace: "team a", name: "api/server" })).toBe(
      "/api/pods/team%20a/api%2Fserver",
    );
  });

  it("throws when required parameters are missing", () => {
    expect(() => apiRoute("/incidents/{id}", {})).toThrow(/Missing path param "id"/);
  });

  it("throws when unexpected parameters are provided", () => {
    expect(() => apiRoute("/stats", { id: "unexpected" })).toThrow(/Unexpected path param "id"/);
  });
});
