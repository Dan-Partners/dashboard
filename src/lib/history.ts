import { dayKey, formatClock } from "./format";
import { DanError } from "./errors";
import type { Order, OrderStatus } from "./types";

/**
 * The order list: looking back through the shop's orders, newest first, a
 * page at a time. The shop server answers `orderHistory`; the demo, and a
 * shop server from before the list, answer from the orders in hand with
 * {@link historyPage}, by the same rules.
 */
export type OrderHistoryFilter = {
  /** An order number (12 or #12), part of the customer's name, or three or more digits of their phone. */
  search?: string;
  /** One day, YYYY-MM-DD, in London time. */
  day?: string;
  /** Only these statuses. Empty: every status, cancelled included. */
  status?: OrderStatus[];
};

export type OrderPage = { orders: Order[]; next: string | null };

export const HISTORY_PAGE = 50;
export const MAX_SEARCH = 60;

/** The choices the list offers for "which orders". */
export const STATUS_CHOICES = {
  all: [],
  open: ["new", "preparing", "ready"],
  completed: ["completed"],
  cancelled: ["cancelled"],
} as const satisfies Record<string, readonly OrderStatus[]>;
export type StatusChoice = keyof typeof STATUS_CHOICES;

/** What a search means: the order number it may be, the phone digits, or the name. */
function searchMatcher(search: string): ((order: Order) => boolean) | null {
  const trimmed = search.trim();
  if ([...trimmed].length > MAX_SEARCH) throw new DanError("invalid", `Search for up to ${MAX_SEARCH} characters.`);
  const text = trimmed.replace(/^#+/, "").trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  const phoneLike = /^[\d +\-()]+$/.test(text);
  if (phoneLike && digits) {
    const number = digits.length <= 9 ? Number(digits) : null;
    return (order) => (number !== null && order.number === number) || (digits.length >= 3 && order.phone.replace(/\D/g, "").includes(digits));
  }
  const wanted = text.toLowerCase();
  return (order) => order.customerName.toLowerCase().includes(wanted);
}

const cursorOf = (order: Order) => `${new Date(order.createdAt).getTime()}_${order.id}`;

/** Newest first; orders placed in the same millisecond by id, as the server sorts them. */
function newestFirst(a: Order, b: Order): number {
  const at = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  return at !== 0 ? at : a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** One page of `orders` for a filter, by the server's rules. */
export function historyPage(orders: Order[], filter: OrderHistoryFilter = {}, before?: string | null, limit = HISTORY_PAGE): OrderPage {
  const matches = filter.search ? searchMatcher(filter.search) : null;
  const day = filter.day?.trim();
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new DanError("invalid", "Give the day as YYYY-MM-DD.");
  const statuses = filter.status ?? [];
  let list = orders
    .filter((order) => (!matches || matches(order)) && (!day || dayKey(new Date(order.createdAt)) === day) && (statuses.length === 0 || statuses.includes(order.status)))
    .sort(newestFirst);
  if (before) {
    const split = before.indexOf("_");
    const at = Number(before.slice(0, split));
    const id = before.slice(split + 1);
    if (split < 1 || !Number.isFinite(at) || !id) throw new DanError("invalid", "That page marker is not one of ours. Start the list again.");
    list = list.filter((order) => {
      const time = new Date(order.createdAt).getTime();
      return time < at || (time === at && order.id < id);
    });
  }
  const size = Math.min(100, Math.max(1, limit));
  const page = list.slice(0, size);
  return { orders: page, next: list.length > size ? cursorOf(page[page.length - 1]) : null };
}

/**
 * The rows the list shows: the pages fetched so far, with any order the
 * board already has live shown as the board has it (its newest state).
 */
export function withLive(rows: Order[], live: Order[]): Order[] {
  const byId = new Map(live.map((order) => [order.id, order]));
  return rows.map((row) => byId.get(row.id) ?? row);
}

/** Adds a page to the rows, each order once, newest first. */
export function mergeRows(rows: Order[], page: Order[]): Order[] {
  const seen = new Set(page.map((order) => order.id));
  return [...page, ...rows.filter((order) => !seen.has(order.id))].sort(newestFirst);
}

/** When an order was placed, for the list: the time today, the date and time before. */
export function listTime(iso: string, now: Date, locale: string): string {
  const at = new Date(iso);
  if (dayKey(at) === dayKey(now)) return formatClock(at);
  const date = new Intl.DateTimeFormat(locale === "zh-Hant" ? "zh-Hant" : "en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    ...(dayKey(at).slice(0, 4) === dayKey(now).slice(0, 4) ? {} : { year: "numeric" }),
  }).format(at);
  return `${date}, ${formatClock(at)}`;
}
