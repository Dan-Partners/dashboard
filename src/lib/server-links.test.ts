import { describe, expect, it } from "vitest";
import { linkFrom } from "./server-links";

describe("server lights", () => {
  it("go from checking to connected, then reconnecting, then offline after three misses", () => {
    expect(linkFrom(0, false)).toBe("checking");
    expect(linkFrom(0, true)).toBe("connected");
    expect(linkFrom(1, true)).toBe("reconnecting");
    expect(linkFrom(2, true)).toBe("reconnecting");
    expect(linkFrom(3, true)).toBe("offline");
  });
});
