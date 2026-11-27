import { describe, expect, it } from "vitest";
import { MOVED_PAGES } from "./old-addresses";
import { SETTINGS_SECTIONS, sectionsFor, settingsRoute, stripeState } from "./settings";

describe("Settings", () => {
  it("lists six sections for the owner, in the owner's order of need", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id)).toEqual(["shop", "ordering", "flow", "tables", "integrations", "subscription"]);
    expect(sectionsFor(true)).toHaveLength(6);
  });

  it("shows the counter PIN Tables & printers only", () => {
    expect(sectionsFor(false)).toEqual(["tables"]);
  });

  it("forwards every page that moved to a section that exists", () => {
    const sections = SETTINGS_SECTIONS.map((section) => settingsRoute(section.id));
    for (const { from, to } of MOVED_PAGES) {
      expect(sections.some((route) => to === route || to.startsWith(`${route}/`)), `${from} → ${to}`).toBe(true);
    }
    expect(MOVED_PAGES.map((page) => page.from).sort()).toEqual(["/shop/board", "/shop/ordering", "/shop/payments", "/shop/tools"]);
  });

  it("says how Stripe stands, and that a payout hold needs the owner", () => {
    const status = (extra: object) => ({ available: true, connected: true, accountReady: true, payoutsEnabled: true, ...extra });
    expect(stripeState(null, false)).toBe("needs_cloud");
    expect(stripeState(null, true)).toBe("checking");
    expect(stripeState(status({ connected: false, accountReady: false }), true)).toBe("not_connected");
    expect(stripeState(status({ accountReady: false }), true)).toBe("attention");
    expect(stripeState(status({ payoutsEnabled: false }), true)).toBe("attention");
    expect(stripeState(status({}), true)).toBe("connected");
    // An older cloud does not say whether Stripe pays out: that is not a hold.
    expect(stripeState(status({ payoutsEnabled: undefined }), true)).toBe("connected");
  });
});
