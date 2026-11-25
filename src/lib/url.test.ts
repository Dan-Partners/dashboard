import { describe, expect, it } from "vitest";
import { normalizeCloudUrl } from "./url";

describe("the Dan cloud's address", () => {
  it("is https, added when left out", () => {
    expect(normalizeCloudUrl("goldendragon.dan.partners/staff/")).toBe("https://goldendragon.dan.partners/staff");
    expect(normalizeCloudUrl("  ")).toBeNull();
  });

  it("refuses plain http except on this machine", () => {
    expect(() => normalizeCloudUrl("http://cloud.example")).toThrow("https://");
    expect(() => normalizeCloudUrl("http://localhost.example")).toThrow("https://");
    expect(normalizeCloudUrl("http://localhost:2290")).toBe("http://localhost:2290");
    expect(normalizeCloudUrl("http://127.0.0.1:2290")).toBe("http://127.0.0.1:2290");
    expect(normalizeCloudUrl("http://goldendragon.localhost:2290/staff")).toBe("http://goldendragon.localhost:2290/staff");
  });
});
