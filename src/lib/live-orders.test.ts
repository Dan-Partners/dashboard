import { describe, expect, it } from "vitest";
import { afterFetch, newLiveOrders, tellOrder } from "./live-orders";
import type { Order } from "./types";

const order = (id: string, status: Order["status"]): Order => ({
  id,
  number: 1,
  createdAt: "2026-11-27T12:00:00.000Z",
  source: "online",
  fulfilment: "collection",
  status,
  customerName: "",
  phone: "",
  address: "",
  notes: "",
  lines: [],
  totalPence: 0,
});

describe("a full fetch and the live channel, arriving in either order", () => {
  it("keeps what the live channel told of while the fetch was on its way", () => {
    const live = newLiveOrders();
    tellOrder(live, order("a", "ready"));
    // The kitchen taps Ready and fetches everything; meanwhile the pass serves the order.
    const startedAt = live.tick;
    tellOrder(live, order("a", "completed"));
    tellOrder(live, order("c", "new"));
    const shown = afterFetch(live, [order("a", "ready"), order("b", "preparing")], startedAt);
    // The fetch's older copy of "a" does not put it back a step, and the new order it did not have stays.
    expect(shown.map((entry) => [entry.id, entry.status])).toEqual([
      ["c", "new"],
      ["a", "completed"],
      ["b", "preparing"],
    ]);
  });

  it("takes the fetch as it is when nothing was told of meanwhile, and forgets what the fetch already has", () => {
    const live = newLiveOrders();
    tellOrder(live, order("a", "new"));
    const fetched = [order("a", "preparing")];
    expect(afterFetch(live, fetched, live.tick)).toBe(fetched);
    expect(live.told.size).toBe(0);
    // A later fetch is not held back by news from before it started.
    expect(afterFetch(live, [order("a", "ready")], live.tick)[0].status).toBe("ready");
  });
});
