import { describe, expect, it } from "vitest";
import { percentText, sameDeal } from "./payments";

describe("Dan's deal on the Payments page", () => {
  it("writes the share as people say it", () => {
    expect(percentText(300)).toBe("3");
    expect(percentText(250)).toBe("2.5");
    expect(percentText(125)).toBe("1.25");
  });

  it("tells a changed deal from the accepted one", () => {
    const standard = { freeCardOrders: 100, percentBp: 300, capPence: 100 };
    expect(sameDeal(standard, { ...standard })).toBe(true);
    expect(sameDeal(standard, { ...standard, freeCardOrders: 50 })).toBe(false);
    expect(sameDeal(standard, null)).toBe(false);
  });
});
