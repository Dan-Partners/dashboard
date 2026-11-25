import { ticketSections, type TicketSection } from "./ticket";
import { STATIONS, type Order, type OrderStatus, type Station } from "./types";

/** The jobs a tablet can be locked to. */
export const POSITIONS = ["kitchen", "till", "pass", "board"] as const;
export type Position = (typeof POSITIONS)[number];

/** Where each position's screen lives. */
export const POSITION_ROUTE: Record<Position, string> = {
  kitchen: "/shop/kitchen",
  till: "/shop/till",
  pass: "/shop/pass",
  board: "/shop/orders",
};

/** A tablet locked to one position. Saved on the tablet, so a reload stays locked. */
export type Focus = { position: Position };

export function normalizeFocus(value: unknown): Focus | null {
  if (!value || typeof value !== "object") return null;
  const position = (value as { position?: unknown }).position;
  return POSITIONS.includes(position as Position) ? { position: position as Position } : null;
}

/** The kitchen's station filter: known stations, no repeats, never empty (empty means all). */
export function normalizeStations(value: unknown): Station[] {
  if (!Array.isArray(value)) return [...STATIONS];
  const picked = STATIONS.filter((station) => value.includes(station));
  return picked.length > 0 ? picked : [...STATIONS];
}

/** Turns one station on or off, keeping at least one on. */
export function toggleStation(current: Station[], station: Station): Station[] {
  const next = current.includes(station) ? current.filter((entry) => entry !== station) : [...current, station];
  return next.length > 0 ? STATIONS.filter((entry) => next.includes(entry)) : current;
}

export const allStations = (stations: Station[]) => stations.length === STATIONS.length;

/** A tap on a station chip: from "all", picks just that one; after that, adds or removes it. */
export function pickStation(current: Station[], station: Station): Station[] {
  return allStations(current) ? [station] : toggleStation(current, station);
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

/**
 * The kitchen screen: open orders oldest first (the next to cook comes
 * first), then orders done in the last 15 minutes. Nothing is left out for
 * the filter; tickets say whether they have work for the stations picked.
 */
export function kitchenTickets(orders: Order[], stations: Station[], memory: DoneMemory, now: number): KitchenTicket[] {
  const make = (order: Order): KitchenTicket => {
    const sections = ticketSections(order);
    return { order, sections, forPicked: sections.some((section) => stations.includes(section.station)) };
  };
  const open = orders.filter((order) => OPEN.includes(order.status)).sort(oldestFirst);
  const done = orders
    .filter((order) => order.status === "completed")
    .filter((order) => now - (memory.doneAt.get(order.id) ?? 0) < DONE_SHOWN_MS)
    .sort(oldestFirst);
  return [...open, ...done].map(make);
}

/** The pass: orders ready to hand over, oldest first. */
export function passOrders(orders: Order[]): Order[] {
  return orders.filter((order) => order.status === "ready").sort(oldestFirst);
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
