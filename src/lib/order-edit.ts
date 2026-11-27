import { DanError } from "./errors";
import type { CreateOrderLine, MenuItem, Order, OrderLine } from "./types";

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
  /** The whole list of dishes as it should be now: at least one. */
  lines?: CreateOrderLine[];
};

export type FieldChange = { field: string; before: string; after: string };
/** A dish whose quantity changed: 0 before means added, 0 after means removed. */
export type LineChange = { number: number; nameEn: string; nameZh: string; beforeQty: number; afterQty: number };

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

export const ORDER_EDIT_FIELDS = "id orderId at byId byName kind changes { field before after } lines { number nameEn nameZh beforeQty afterQty } totalBeforePence totalAfterPence";

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

const linesTotal = (lines: OrderLine[]) => lines.reduce((sum, line) => sum + line.qty * line.unitPricePence, 0);

/** A line of an order as the menu has the dish now. */
function lineFromMenu(number: number, qty: number, menu: MenuItem[]): OrderLine {
  const item = menu.find((entry) => entry.number === number);
  if (!item) throw new DanError("unknown_item", `No dish with number ${number}.`);
  if (item.soldOut) throw new DanError("sold_out", `${item.number} ${item.nameEn} is sold out.`);
  return {
    itemId: item.id,
    number: item.number,
    nameEn: item.nameEn,
    nameZh: item.nameZh,
    qty,
    unitPricePence: item.pricePence,
    station: item.station,
    kind: item.kind,
    components:
      item.kind === "set"
        ? item.includes.map((include) => {
            const part = menu.find((entry) => entry.number === include.number);
            if (!part) throw new DanError("bad_item", `Set ${item.number} refers to a missing dish.`);
            return { number: part.number, nameEn: part.nameEn, nameZh: part.nameZh, qty: include.qty * qty, station: part.station };
          })
        : [],
  };
}

/** The dishes as the owner wants them: lines already on the order keep their price; new ones come from the menu now. */
function newLines(order: Order, wanted: CreateOrderLine[], menu: MenuItem[]): OrderLine[] {
  if (wanted.length === 0) throw new DanError("invalid", "An order needs at least one dish. To call it off, cancel it.");
  if (wanted.length > 200) throw new DanError("invalid", "That order has too many lines.");
  const seen = new Set<number>();
  return wanted.map((line) => {
    if (seen.has(line.number)) throw new DanError("invalid", `Dish ${line.number} is on the list twice. Give it one line.`);
    seen.add(line.number);
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > 99) throw new DanError("invalid", "Quantity must be between 1 and 99.");
    const sold = order.lines.find((entry) => entry.number === line.number);
    if (!sold) return lineFromMenu(line.number, line.qty, menu);
    return { ...sold, qty: line.qty, components: sold.components.map((part) => ({ ...part, qty: sold.qty > 0 ? (part.qty / sold.qty) * line.qty : part.qty })) };
  });
}

/** What changed between two lists of dishes, by dish number. */
export function lineChanges(before: OrderLine[], after: OrderLine[]): LineChange[] {
  const byNumber = new Map<number, { was: number; now: number; line: OrderLine }>();
  for (const line of before) byNumber.set(line.number, { was: (byNumber.get(line.number)?.was ?? 0) + line.qty, now: 0, line });
  for (const line of after) {
    const entry = byNumber.get(line.number) ?? { was: 0, now: 0, line };
    byNumber.set(line.number, { ...entry, now: entry.now + line.qty });
  }
  return [...byNumber.entries()]
    .sort(([a], [b]) => a - b)
    .filter(([, entry]) => entry.was !== entry.now)
    .map(([number, entry]) => ({ number, nameEn: entry.line.nameEn, nameZh: entry.line.nameZh, beforeQty: entry.was, afterQty: entry.now }));
}

/**
 * An order after the owner's change, and what changed. Nothing is saved
 * here. `courierBooked`: a courier is booked or on its way, so the address
 * is locked.
 */
export function applyEdit(order: Order, input: OrderEditInput, menu: MenuItem[], courierBooked: boolean): Applied {
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
  if (input.lines) {
    const after = newLines(order, input.lines, menu);
    const record = lineChanges(order.lines, after);
    // The same dishes in another order is not a change.
    if (record.length > 0) {
      // Whatever else is in the bill (a delivery fee) stays in it.
      next.totalPence = order.totalPence - linesTotal(order.lines) + linesTotal(after);
      next.lines = after;
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
