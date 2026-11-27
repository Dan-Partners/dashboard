import { DanError } from "./errors";
import { asApplied, bill, chosen, lineDetail, lineFromMenu, lineSignature, lineTotal, MAX_LINES, MAX_QTY, withAddons } from "./pricing";
import type { Addon, AppliedAddon, CreateOrderLine, MenuItem, Order, OrderLine } from "./types";

/**
 * The owner changing an order after it was placed, and the record of it.
 * The shop server decides (`editOrder`, `moveOrderTo`) and keeps the record
 * for good; this file is the same rules for the demo, and for showing the
 * owner what a change will do before it is saved.
 */

/** What the owner wants changed. Anything left out stays as it is. */
export type OrderEditInput = {
  customerName?: string;
  phone?: string;
  /** Locked while a courier is booked. */
  address?: string;
  notes?: string;
  /** Eat-in orders only. */
  table?: string;
  /**
   * The whole list of dishes as it should be now: at least one. A line that
   * names no options or add-ons means the dish as it was sold.
   */
  lines?: CreateOrderLine[];
  /**
   * The ids of the add-ons on the bill as they should be now. The owner may
   * take off a required one, or put on one not offered for this kind of
   * order. Left out: as they are.
   */
  addons?: string[];
};

export type FieldChange = { field: string; before: string; after: string };
/**
 * A line whose quantity changed: 0 before means added, 0 after means removed.
 * `detail`: the options and add-ons that tell it from another line of the
 * same dish ("Large, Extra chilli"); empty for a plain dish, and missing from
 * records made before options.
 */
export type LineChange = { number: number; nameEn: string; nameZh: string; detail?: string; beforeQty: number; afterQty: number };

/** One change the owner made to an order. Written once, kept for good. */
export type OrderEdit = {
  id: string;
  orderId: string;
  at: string;
  byId: string;
  byName: string;
  /** `cancel`: `changes` has the status it had, and `refund` with the pence asked back from the card. */
  kind: "edit" | "move" | "cancel";
  changes: FieldChange[];
  lines: LineChange[];
  totalBeforePence: number;
  totalAfterPence: number;
};

/** The record's fields. `detail` is asked for only of a server that has dish options (see graphql-client). */
export const orderEditFields = (detail: boolean) =>
  `id orderId at byId byName kind changes { field before after } lines { number nameEn nameZh ${detail ? "detail " : ""}beforeQty afterQty } totalBeforePence totalAfterPence`;
export const ORDER_EDIT_FIELDS = orderEditFields(true);

export type Applied = { order: Order; changes: FieldChange[]; lines: LineChange[] };

function clean(value: string, limit: number, what: string): string {
  const text = value.trim();
  if ([...text].length > limit) throw new DanError("invalid", `The ${what} is too long.`);
  return text;
}

/** A table's name as it goes on tickets, by the server's rule. */
function tableName(value: string): string {
  const tidy = value.trim().split(/\s+/).join(" ");
  if (!tidy || [...tidy].length > 10 || !/^[\p{L}\p{N} -]+$/u.test(tidy)) {
    throw new DanError("bad_table", "A table name is up to 10 letters, numbers, spaces or hyphens.");
  }
  return tidy;
}

const sorted = (ids: string[]) => [...new Set(ids)].sort().join(",");

/**
 * Whether a line already on the order is the one a wanted line means: the
 * same dish, and the same options and add-ons where the wanted line names them.
 */
function isTheLine(sold: OrderLine, wanted: CreateOrderLine): boolean {
  return (
    sold.number === wanted.number &&
    (wanted.options === undefined || sorted(wanted.options) === sorted((sold.options ?? []).map((option) => option.choiceId))) &&
    (wanted.addons === undefined || sorted(wanted.addons) === sorted((sold.addons ?? []).map((addon) => addon.id)))
  );
}

/** A line as it was sold, at another quantity: its set-meal dishes follow, and its add-ons are worked out again. */
function scaled(sold: OrderLine, qty: number): OrderLine {
  const next = { ...sold, qty, components: sold.components.map((part) => ({ ...part, qty: sold.qty > 0 ? (part.qty / sold.qty) * qty : part.qty })) };
  return withAddons(next, sold.addons ?? []);
}

const noSuchAddon = (id: string) => new DanError("bad_addon", `There is no add-on ${id} for that.`);

/**
 * The dishes as the owner wants them. A line already on the order keeps what
 * it was sold at (price, options, add-ons); a new one comes from the menu as
 * it is now. On a new line the owner may put any dish add-on, required or
 * not; when none are named, the ones ticked by default apply.
 */
export function newLines(order: Order, wanted: CreateOrderLine[], menu: MenuItem[], all: Addon[]): OrderLine[] {
  if (wanted.length === 0) throw new DanError("invalid", "An order needs at least one dish. To call it off, cancel it.");
  if (wanted.length > MAX_LINES) throw new DanError("invalid", "That order has too many lines.");
  const channel = order.source === "online" ? "online" : "local";
  const used = order.lines.map(() => false);
  const seen = new Set<string>();
  return wanted.map((line) => {
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > MAX_QTY) throw new DanError("invalid", "Quantity must be between 1 and 99.");
    const at = order.lines.findIndex((sold, index) => !used[index] && isTheLine(sold, line));
    let next: OrderLine;
    if (at >= 0) {
      used[at] = true;
      next = scaled(order.lines[at], line.qty);
    } else {
      const fresh = lineFromMenu(line.number, line.qty, line.options ?? [], menu);
      const onDish = line.addons
        ? line.addons.map((id) => {
            const addon = all.find((entry) => entry.id === id && entry.scope === "dish");
            if (!addon) throw noSuchAddon(id);
            return asApplied(addon);
          })
        : chosen(all, "dish", channel).map(asApplied);
      next = withAddons(fresh, onDish);
    }
    const signature = lineSignature(next);
    if (seen.has(signature)) throw new DanError("invalid", `Dish ${next.number} is on the list twice the same way. Give it one line.`);
    seen.add(signature);
    return next;
  });
}

/**
 * The add-ons on the bill as the owner wants them: one already on the order
 * stays as it was applied; a new one comes from the shop's add-ons as they
 * are now. The owner may put on, or take off, any bill add-on.
 */
function newBillAddons(order: Order, wanted: string[], all: Addon[]): AppliedAddon[] {
  const ids = [...new Set(wanted)];
  const sold = order.addons ?? [];
  for (const id of ids) {
    if (sold.some((addon) => addon.id === id)) continue;
    if (!all.some((addon) => addon.id === id && addon.scope === "bill")) throw noSuchAddon(id);
  }
  // Those already on the bill first, in their order; then the new ones, in the shop's order.
  return [
    ...sold.filter((addon) => ids.includes(addon.id)),
    ...all.filter((addon) => addon.scope === "bill" && ids.includes(addon.id) && !sold.some((entry) => entry.id === addon.id)).map(asApplied),
  ];
}

/** What the lines and the bill's add-ons come to, without any delivery fee. */
const billTotal = (lines: OrderLine[], addons: AppliedAddon[]) => lines.reduce((sum, line) => sum + lineTotal(line), 0) + addons.reduce((sum, addon) => sum + addon.amountPence, 0);

/**
 * What changed between two lists of dishes. The same dish with other options
 * or add-ons is another line, so each is told apart by all three.
 */
export function lineChanges(before: OrderLine[], after: OrderLine[]): LineChange[] {
  const byLine = new Map<string, { was: number; now: number; line: OrderLine }>();
  for (const line of before) {
    const key = lineSignature(line);
    byLine.set(key, { was: (byLine.get(key)?.was ?? 0) + line.qty, now: 0, line: byLine.get(key)?.line ?? line });
  }
  for (const line of after) {
    const key = lineSignature(line);
    const entry = byLine.get(key) ?? { was: 0, now: 0, line };
    byLine.set(key, { ...entry, now: entry.now + line.qty });
  }
  return [...byLine.entries()]
    .sort(([a, x], [b, y]) => x.line.number - y.line.number || (a < b ? -1 : a > b ? 1 : 0))
    .filter(([, entry]) => entry.was !== entry.now)
    .map(([, entry]) => ({ number: entry.line.number, nameEn: entry.line.nameEn, nameZh: entry.line.nameZh, detail: lineDetail(entry.line), beforeQty: entry.was, afterQty: entry.now }));
}

/**
 * An order after the owner's change, and what changed. Nothing is saved
 * here. `courierBooked`: a courier is booked or on its way, so the address
 * is locked.
 */
export function applyEdit(order: Order, input: OrderEditInput, menu: MenuItem[], all: Addon[], courierBooked: boolean): Applied {
  if (order.status === "cancelled") throw new DanError("order_cancelled", "A cancelled order cannot be changed.");
  const next: Order = { ...order };
  const changes: FieldChange[] = [];
  const note = (field: string, before: string, after: string) => changes.push({ field, before, after });

  if (input.customerName !== undefined) {
    const value = clean(input.customerName, 120, "name");
    if (value !== order.customerName) {
      note("customerName", order.customerName, value);
      next.customerName = value;
    }
  }
  if (input.phone !== undefined) {
    const value = clean(input.phone, 40, "phone number");
    if (value !== order.phone) {
      note("phone", order.phone, value);
      next.phone = value;
    }
  }
  if (input.notes !== undefined) {
    const value = clean(input.notes, 400, "note");
    if (value !== order.notes) {
      note("notes", order.notes, value);
      next.notes = value;
    }
  }
  if (input.address !== undefined) {
    const value = clean(input.address, 400, "address");
    if (value !== order.address) {
      if (courierBooked) throw new DanError("address_locked", "A courier is booked for this address. Cancel the courier first, or change the order to collection.");
      if (order.fulfilment === "delivery" && !value) throw new DanError("invalid", "A delivery needs an address.");
      note("address", order.address, value);
      next.address = value;
    }
  }
  if (input.table !== undefined) {
    const current = order.table ?? "";
    if (order.fulfilment !== "eat_in") {
      if (input.table.trim()) throw new DanError("invalid", "Only an eat-in order has a table.");
    } else {
      if (!input.table.trim()) throw new DanError("bad_table", "An eat-in order needs its table.");
      const value = tableName(input.table);
      if (value !== current) {
        note("table", current, value);
        next.table = value;
      }
    }
  }

  let lines: LineChange[] = [];
  if (input.lines || input.addons) {
    const sold = order.addons ?? [];
    const after = input.lines ? newLines(order, input.lines, menu, all) : order.lines;
    const record = lineChanges(order.lines, after);
    const onBill = input.addons ? newBillAddons(order, input.addons, all) : sold;
    const addonsChanged = onBill.map((addon) => addon.id).join(",") !== sold.map((addon) => addon.id).join(",");
    // The same dishes in another order, with the same add-ons, is not a change.
    if (record.length > 0 || addonsChanged) {
      // The bill's add-ons are worked out again on the dishes as they are now.
      const priced = bill(after, onBill);
      // Whatever else is in the bill (a delivery fee) stays in it.
      next.totalPence = order.totalPence - billTotal(order.lines, sold) + priced.totalPence;
      if (addonsChanged) note("addons", sold.map((addon) => addon.nameEn).join(", "), priced.addons.map((addon) => addon.nameEn).join(", "));
      next.lines = priced.lines;
      next.addons = priced.addons;
      lines = record;
    }
  }

  if (changes.length > 0 || lines.length > 0) {
    next.editCount = (order.editCount ?? 0) + 1;
    // The first time the bill of a paid order moves, what was taken is kept beside it.
    if (order.payment?.status === "paid" && next.totalPence !== order.totalPence && order.paidPence == null) next.paidPence = order.totalPence;
  }
  return { order: next, changes, lines };
}

/** A courier is booked or on its way: Uber has the address, so it is locked. */
export function courierBooked(order: Pick<Order, "courier">): boolean {
  const status = order.courier?.status ?? "";
  return Boolean(order.courier?.deliveryId) && !["delivered", "canceled", "returned"].includes(status);
}

/**
 * For an order already paid whose bill a change has moved: what was taken,
 * and what is now to collect (positive) or to refund (negative). Null when
 * the bill is what was paid.
 */
export function paidDifference(order: Pick<Order, "paidPence" | "totalPence" | "payment">): { paidPence: number; differencePence: number } | null {
  if (order.paidPence == null || order.payment?.status !== "paid" || order.paidPence === order.totalPence) return null;
  return { paidPence: order.paidPence, differencePence: order.totalPence - order.paidPence };
}

/**
 * What cancelling an order would do about money already paid online. A card
 * payment is refunded in full by the Dan cloud, for what was taken; a bank
 * transfer is the owner's to send back (Dan cannot); anything else was not
 * paid through Dan.
 */
export type CancelPlan = { kind: "card" | "bank"; pence: number } | { kind: "none" };

export function cancelPlan(order: Pick<Order, "payment" | "paidPence" | "totalPence">): CancelPlan {
  if (order.payment?.status !== "paid") return { kind: "none" };
  const pence = order.paidPence ?? order.totalPence;
  if (order.payment.method === "card") return { kind: "card", pence };
  if (order.payment.method === "bank_transfer") return { kind: "bank", pence };
  return { kind: "none" };
}

/**
 * Where a cancelled order's money stands: the card refunded, the refund
 * still on its way, the refund failed (the owner does it in Stripe), a bank
 * transfer to send back, or nothing to refund.
 */
export type RefundState = { state: "refunded" | "pending" | "failed" | "bank"; pence: number } | null;

export function refundState(order: Pick<Order, "status" | "payment" | "paidPence" | "totalPence" | "refund">): RefundState {
  if (order.status !== "cancelled") return null;
  const plan = cancelPlan(order);
  if (plan.kind === "none") return null;
  if (plan.kind === "bank") return { state: "bank", pence: plan.pence };
  return { state: order.refund === "refunded" ? "refunded" : order.refund ? "failed" : "pending", pence: plan.pence };
}
