import { columnOf, type Board, type BoardColumn } from "./board";
import type { Order } from "./types";

/*
 * Tickets entering a column, as this tablet sees them live: what ticket
 * sounds are made of (DAN-26).
 *
 * What the tablet loads (opening the page, a refresh, a reconnect) is only
 * noted, never sounded, so nothing is replayed. A ticket moved by a change
 * to the board (`columnRemap`) is noted, not sounded. A move this tablet
 * made itself is not news to it. An unpaid order is not on the board, so it
 * first appears, and sounds, when it is paid.
 */

export type Arrival = { key: string; order: Order; column: BoardColumn };

const known = new Map<string, string>();
const listeners = new Set<(arrival: Arrival) => void>();
/** Moves this tablet asked for: order id → column id, until then. */
const mine = new Map<string, { column: string; until: number }>();

function keyOf(order: Order, column: BoardColumn): string {
  return `${order.id}|${column.id}|${order.columnAt ?? order.createdAt}`;
}

/** Notes what is on the board now, silently (a load, refresh or reconnect). */
export function noteBoard(orders: Order[], board: Board) {
  for (const order of orders) {
    const column = columnOf(board, order);
    if (column) known.set(order.id, keyOf(order, column));
  }
}

/** Whether the tablet has loaded the board at least once. */
export function boardNoted(): boolean {
  return known.size > 0;
}

/** This tablet is about to move a ticket: it does not need telling. */
export function expectMine(orderId: string, columnId: string) {
  mine.set(orderId, { column: columnId, until: Date.now() + 15_000 });
}

/** An order as it changed live. Tells listeners if it entered a column. */
export function seeOrder(order: Order, board: Board) {
  const column = columnOf(board, order);
  if (!column || order.status === "cancelled") {
    known.delete(order.id);
    return;
  }
  const key = keyOf(order, column);
  if (known.get(order.id) === key) return;
  known.set(order.id, key);
  if (order.columnRemap) return;
  const expected = mine.get(order.id);
  if (expected && expected.column === column.id && expected.until > Date.now()) {
    mine.delete(order.id);
    return;
  }
  for (const listener of listeners) listener({ key, order, column });
}

export function onArrival(listener: (arrival: Arrival) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** For tests. */
export function forgetArrivals() {
  known.clear();
  mine.clear();
}
