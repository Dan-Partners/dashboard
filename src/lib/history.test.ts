import { describe, expect, it } from "vitest";
import { historyPage, listTime, mergeRows, withLive } from "./history";
import type { Order } from "./types";

function order(number: number, patch: Partial<Order> = {}): Order {
  return {
    id: `o-${number}`,
    number,
    createdAt: new Date(Date.UTC(2026, 10, 26, 12, number)).toISOString(),
    source: "phone",
    fulfilment: "collection",
    status: "preparing",
    customerName: "",
    phone: "",
    address: "",
    notes: "",
    lines: [],
    totalPence: 100 * number,
    ...patch,
  };
}

const ORDERS = [
  order(1, { customerName: "Mrs Wong", phone: "07700 900123", status: "cancelled" }),
  order(2, { customerName: "Sam O'Neil", phone: "01923 220418", status: "completed" }),
  order(3, { customerName: "mei" }),
  order(4, { customerName: ".*", phone: "020 7946 0000" }),
  order(5, { phone: "07700 900999" }),
];
const numbers = (orders: Order[]) => orders.map((entry) => entry.number);

describe("the order list, made from the orders in hand", () => {
  it("goes back a page at a time, newest first, to the end", () => {
    const first = historyPage(ORDERS, {}, null, 2);
    expect(numbers(first.orders)).toEqual([5, 4]);
    const second = historyPage(ORDERS, {}, first.next, 2);
    expect(numbers(second.orders)).toEqual([3, 2]);
    const third = historyPage(ORDERS, {}, second.next, 2);
    expect(numbers(third.orders)).toEqual([1]);
    expect(third.next).toBeNull();
    // Exactly a page: no marker for a page that would be empty.
    expect(historyPage(ORDERS, {}, null, 5).next).toBeNull();
    expect(() => historyPage(ORDERS, {}, "nonsense")).toThrow();
  });

  it("finds by number, by name as plain text, and by phone digits however typed", () => {
    const found = (search: string) => numbers(historyPage(ORDERS, { search }).orders);
    expect(found("#3")).toEqual([3]);
    expect(found(" 2 ")).toEqual([2]);
    expect(found("WONG")).toEqual([1]);
    expect(found("o'neil")).toEqual([2]);
    expect(found(".*")).toEqual([4]);
    expect(found("nobody")).toEqual([]);
    expect(found("7700900")).toEqual([5, 1]);
    expect(found("220 418")).toEqual([2]);
    expect(found("  ")).toEqual([5, 4, 3, 2, 1]);
    expect(() => historyPage(ORDERS, { search: "x".repeat(61) })).toThrow();
  });

  it("narrows to statuses and to a London day", () => {
    expect(numbers(historyPage(ORDERS, { status: ["cancelled", "completed"] }).orders)).toEqual([2, 1]);
    expect(numbers(historyPage(ORDERS, { status: ["preparing"], search: "7700" }).orders)).toEqual([5]);
    expect(numbers(historyPage(ORDERS, { status: [] }).orders)).toEqual([5, 4, 3, 2, 1]);
    expect(historyPage(ORDERS, { day: "2026-11-26" }).orders).toHaveLength(5);
    expect(historyPage(ORDERS, { day: "2020-01-01" }).orders).toHaveLength(0);
    // 23:30 UTC on 30 June is already 1 July in London (summer time).
    const late = order(9, { createdAt: "2026-06-30T23:30:00.000Z" });
    expect(numbers(historyPage([late], { day: "2026-07-01" }).orders)).toEqual([9]);
    expect(historyPage([late], { day: "2026-06-30" }).orders).toHaveLength(0);
    expect(() => historyPage(ORDERS, { day: "yesterday" })).toThrow();
  });

  it("shows an order the board has as the board has it, and adds pages once each", () => {
    const rows = historyPage(ORDERS, {}, null, 3).orders;
    const live = [{ ...ORDERS[4], status: "ready" as const }];
    expect(withLive(rows, live).map((entry) => entry.status)).toEqual(["ready", "preparing", "preparing"]);
    const fresh = [order(6), ORDERS[4]];
    expect(numbers(mergeRows(rows, fresh))).toEqual([6, 5, 4, 3]);
  });

  it("says the time today, the date before, and the year when it is another year", () => {
    const now = new Date("2026-11-26T20:00:00Z");
    expect(listTime("2026-11-26T19:02:00Z", now, "en")).toBe("19:02");
    expect(listTime("2026-11-24T19:02:00Z", now, "en")).toBe("24 Nov, 19:02");
    expect(listTime("2025-11-24T19:02:00Z", now, "en")).toBe("24 Nov 2025, 19:02");
  });
});
