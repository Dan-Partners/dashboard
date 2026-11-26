import { columnOf, type Board } from "./board";
import { ticketSections, type TicketSection } from "./ticket";
import type { Order, OrderStatus, Station } from "./types";
import { viewRoute } from "./views";

/**
 * What a tablet can be locked to: one of the owner's views, the till, or the
 * orders board. Saved on the tablet, so a reload stays locked.
 */
export type Focus = { position: "view"; view: string } | { position: "till" } | { position: "board" };

/** Where an order is created: by picking from the menu, or with the till's keypad. */
export const CREATE_ORDER_ROUTE = "/shop/orders/new";

/** Where a locked tablet's screen lives. */
export function focusRoute(focus: Focus): string {
  if (focus.position === "view") return viewRoute(focus.view);
  // The till is create order, in till mode.
  return focus.position === "till" ? CREATE_ORDER_ROUTE : "/shop/orders";
}

export function normalizeFocus(value: unknown): Focus | null {
  if (!value || typeof value !== "object") return null;
  const { position, view } = value as { position?: unknown; view?: unknown };
  if (position === "till" || position === "board") return { position };
  // Tablets locked before views existed were locked to the kitchen or the pass, now the views with those ids.
  if (position === "kitchen" || position === "pass") return { position: "view", view: position };
  if (position === "view" && typeof view === "string" && /^[a-z0-9_-]{1,32}$/.test(view)) return { position: "view", view };
  return null;
}

/** What a tablet keeps of its station filter: station ids. Empty means all. */
export function normalizeStations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.length <= 32))].slice(0, 12);
}

/**
 * The stations a tablet shows large: the ones it picked that the shop still
 * has, in the shop's order, or all of them when it picked none.
 */
export function pickedStations(saved: string[], stations: Station[]): string[] {
  const all = stations.map((station) => station.id);
  const picked = all.filter((id) => saved.includes(id));
  return picked.length > 0 ? picked : all;
}

export const allStations = (picked: string[], stations: Station[]) => picked.length >= stations.length;

/** Turns one station on or off, keeping at least one on. */
export function toggleStation(picked: string[], station: string, stations: Station[]): string[] {
  const next = picked.includes(station) ? picked.filter((entry) => entry !== station) : [...picked, station];
  return next.length > 0 ? stations.map((entry) => entry.id).filter((id) => next.includes(id)) : picked;
}

/**
 * A tap on a station chip: from "all", picks just that one; after that, adds
 * or removes it. Returns what the tablet keeps (empty once all are on again).
 */
export function pickStation(saved: string[], station: string, stations: Station[]): string[] {
  const picked = pickedStations(saved, stations);
  const next = allStations(picked, stations) ? [station] : toggleStation(picked, station, stations);
  return allStations(next, stations) ? [] : next;
}

/** How long a done ticket stays on the kitchen screen, greyed. */
export const DONE_SHOWN_MS = 15 * 60_000;

/**
 * When this tablet first knew each order was done. Orders record only when
 * they were placed (DAN-17), so: the moment the tablet saw an order it had
 * seen open turn done; or, for one already done when first seen (after a
 * reload), the time it was placed.
 */
export type DoneMemory = { open: Set<string>; doneAt: Map<string, number> };

export function newDoneMemory(): DoneMemory {
  return { open: new Set(), doneAt: new Map() };
}

export function noteOrders(memory: DoneMemory, orders: Order[], now: number) {
  for (const order of orders) {
    if (order.status === "cancelled") continue;
    if (order.status !== "completed") {
      memory.open.add(order.id);
      memory.doneAt.delete(order.id);
    } else if (!memory.doneAt.has(order.id)) {
      memory.doneAt.set(order.id, memory.open.has(order.id) ? now : new Date(order.createdAt).getTime());
    }
  }
}

export type KitchenTicket = {
  order: Order;
  /** Every station on the order, in kitchen order. */
  sections: TicketSection[];
  /** True when the order has something for the stations picked. */
  forPicked: boolean;
};

const OPEN: OrderStatus[] = ["new", "preparing", "ready"];

const oldestFirst = (a: Order, b: Order) => (a.createdAt < b.createdAt ? -1 : 1);

/** The part of the board a view shows. */
export type Scope = { board: Board; columns: string[] };

/** True when the order sits in one of the scope's columns. */
function inScope(order: Order, scope: Scope): boolean {
  const column = columnOf(scope.board, order);
  return column !== null && scope.columns.includes(column.id);
}

/**
 * A "make" screen: open orders oldest first (the next to make comes first),
 * then orders done in the last 15 minutes. Nothing is left out for the
 * station filter; tickets say whether they have work for the stations picked.
 *
 * With a `scope` (a view), only orders in the view's columns are shown, and
 * done orders only when the view reaches the end of the flow (it shows a
 * ready column): a prep bench does not see tickets again when they finish.
 */
export function kitchenTickets(orders: Order[], picked: string[], stations: Station[], memory: DoneMemory, now: number, scope?: Scope): KitchenTicket[] {
  const everything = allStations(picked, stations);
  const make = (order: Order): KitchenTicket => {
    const sections = ticketSections(order, stations);
    // With every station on, every ticket has work here, whatever its dishes' stations.
    return { order, sections, forPicked: everything || sections.some((section) => picked.includes(section.station)) };
  };
  const open = orders.filter((order) => OPEN.includes(order.status) && (!scope || inScope(order, scope))).sort(oldestFirst);
  const showsDone = !scope || scope.board.columns.some((column) => column.role === "ready" && scope.columns.includes(column.id));
  const done = showsDone
    ? orders
        .filter((order) => order.status === "completed")
        .filter((order) => now - (memory.doneAt.get(order.id) ?? 0) < DONE_SHOWN_MS)
        .sort(oldestFirst)
    : [];
  return [...open, ...done].map(make);
}

/** A "hand over" screen: orders ready to hand over (or, for a view, in its columns), oldest first. */
export function passOrders(orders: Order[], scope?: Scope): Order[] {
  return orders.filter((order) => (scope ? OPEN.includes(order.status) && inScope(order, scope) : order.status === "ready")).sort(oldestFirst);
}

/** Open orders that have not reached the view yet: still in a column before its first. */
export function comingTo(orders: Order[], scope: Scope): number {
  const first = scope.board.columns.findIndex((column) => scope.columns.includes(column.id));
  if (first < 0) return 0;
  return orders.filter((order) => {
    if (!OPEN.includes(order.status)) return false;
    const column = columnOf(scope.board, order);
    const at = column ? scope.board.columns.findIndex((entry) => entry.id === column.id) : -1;
    return at >= 0 && at < first;
  }).length;
}

/** Full screen, where the browser has it (not on iPhone). Needs a tap. */
export function enterFullscreen() {
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (document.fullscreenElement) return;
  if (root.requestFullscreen) void root.requestFullscreen().catch(() => undefined);
  else root.webkitRequestFullscreen?.();
}

export function exitFullscreen() {
  const doc = document as Document & { webkitExitFullscreen?: () => void; webkitFullscreenElement?: Element | null };
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  else if (doc.webkitFullscreenElement) doc.webkitExitFullscreen?.();
}

export function fullscreenAvailable(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: unknown };
  return Boolean(document.fullscreenEnabled ?? root.webkitRequestFullscreen);
}
