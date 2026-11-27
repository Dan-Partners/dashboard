import type { Order } from "./types";

/**
 * Orders the live channel has told of, in the order they were told. A full
 * fetch takes a moment; a change that arrives while it is on its way is newer
 * than what the fetch will bring, and must not be overwritten by it. (Seen as
 * a ticket that jumped back a step on one tablet when two people tapped in
 * the same moment: the server was right, the tablet was showing an old copy.)
 */
export type LiveOrders = { tick: number; told: Map<string, { tick: number; order: Order }> };

export const newLiveOrders = (): LiveOrders => ({ tick: 0, told: new Map() });

/** Notes an order the live channel has just told of. */
export function tellOrder(live: LiveOrders, order: Order): void {
  live.tick += 1;
  live.told.set(order.id, { tick: live.tick, order });
}

/**
 * The orders to show after a full fetch that started at `startedAt` (the
 * live channel's tick then): what was fetched, except that an order told of
 * since then keeps the copy it was told with. What was told before the fetch
 * started is forgotten: the fetch has it.
 */
export function afterFetch(live: LiveOrders, fetched: Order[], startedAt: number): Order[] {
  const newer = [...live.told.values()].filter((entry) => entry.tick > startedAt).sort((a, b) => b.tick - a.tick);
  for (const [id, entry] of live.told) if (entry.tick <= startedAt) live.told.delete(id);
  if (newer.length === 0) return fetched;
  const ids = new Set(newer.map((entry) => entry.order.id));
  return [...newer.map((entry) => entry.order), ...fetched.filter((order) => !ids.has(order.id))];
}
