import { describe, expect, it } from "vitest";
import { dealSentences, feeText, percentText, sameDeal, type DealCopy } from "./payments";
import { english } from "./i18n";

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

describe("Dan's deal in words (DAN-41)", () => {
  const copy = (key: DealCopy) => english(key);
  const fromStripe = { freeCardOrders: 0, percentBp: 50, fixedPence: 10, capPence: 100, offerOrdersPerMonth: 100, offerMonths: 6 };

  it("says the deal from Stripe: the launch offer, then 0.5% + 10p capped at £1", () => {
    expect(feeText(fromStripe)).toBe("0.5% + 10p");
    expect(dealSentences(fromStripe, copy, "27 May 2027")).toBe(
      "Launch offer: your first 100 card orders each month are free of any Dan fee, until 27 May 2027. Otherwise, Dan's fee is 0.5% + 10p of each card payment, at most £1.00 per order.",
    );
    expect(dealSentences(fromStripe, copy, null)).toContain("for your first 6 months.");
  });

  it("says a deal accepted before as it always did", () => {
    expect(dealSentences({ freeCardOrders: 100, percentBp: 300, capPence: 100 }, copy, null)).toBe(
      "Your first 100 card orders are free of any Dan fee. After that, Dan's fee is 3% of each card payment, at most £1.00 per order.",
    );
    expect(dealSentences({ freeCardOrders: 0, percentBp: 250, capPence: 150 }, copy, null)).toBe("Dan's fee is 2.5% of each card payment, at most £1.50 per order.");
  });

  it("tells a new deal from the old one by every part", () => {
    const old = { freeCardOrders: 100, percentBp: 300, capPence: 100 };
    expect(sameDeal(old, { ...old, fixedPence: 0, offerOrdersPerMonth: 0, offerMonths: 0 })).toBe(true);
    expect(sameDeal(fromStripe, { ...fromStripe, fixedPence: 20 })).toBe(false);
    expect(sameDeal(fromStripe, { ...fromStripe, offerMonths: 3 })).toBe(false);
  });
});
