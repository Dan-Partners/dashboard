import { percentText, signedPence } from "./addons";
import type { Order, OrderLine, Station } from "./types";

/** What was chosen for a dish: an option, or an add-on on the dish. */
export type TicketDetail = { nameEn: string; nameZh: string; addon: boolean };

export type TicketLine = {
  number: number;
  nameEn: string;
  nameZh: string;
  qty: number;
  station: string;
  /** The options chosen and the add-ons on the dish, in order. Empty for a plain dish. */
  details: TicketDetail[];
};

export type TicketSection = {
  /** The station's id; "" for dishes with no station. */
  station: string;
  lines: TicketLine[];
};

/** What was chosen for a line: each option, then each add-on on the dish. */
export function lineDetails(line: Pick<OrderLine, "options" | "addons">): TicketDetail[] {
  return [
    ...(line.options ?? []).map((option) => ({ nameEn: option.nameEn, nameZh: option.nameZh, addon: false })),
    ...(line.addons ?? []).map((addon) => ({ nameEn: addon.nameEn, nameZh: addon.nameZh, addon: true })),
  ];
}

const detailKey = (details: TicketDetail[]) => details.map((detail) => `${detail.addon ? "+" : ""}${detail.nameEn}`).join("|");

/** A line's place in a list: the same dish chosen two ways is two lines. */
export const ticketLineKey = (line: TicketLine) => `${line.station}:${line.number}:${detailKey(line.details)}`;

/**
 * An order's dishes by station, set meals opened up into their dishes. The
 * shop's stations come first, in the owner's order; then any station an
 * older order names that has since gone; then dishes with no station. The
 * same dish chosen two ways is two lines, and a set meal's dishes each carry
 * what was put on the set.
 */
export function ticketSections(order: Order, stations: Station[]): TicketSection[] {
  const merged = new Map<string, TicketLine>();

  const add = (line: TicketLine) => {
    const key = ticketLineKey(line);
    const existing = merged.get(key);
    if (existing) {
      existing.qty += line.qty;
      return;
    }
    merged.set(key, { ...line });
  };

  for (const line of order.lines) {
    const details = lineDetails(line);
    if (line.components.length > 0) {
      for (const component of line.components) add({ ...component, details });
    } else {
      add({ number: line.number, nameEn: line.nameEn, nameZh: line.nameZh, qty: line.qty, station: line.station, details });
    }
  }

  const lines = [...merged.values()];
  const order_of = stations.map((station) => station.id);
  for (const line of lines) if (line.station && !order_of.includes(line.station)) order_of.push(line.station);
  order_of.push("");
  return order_of
    .map((station) => ({
      station,
      // By dish number; the same dish chosen two ways stays in the order it was taken.
      lines: lines.filter((line) => (line.station ?? "") === station).sort((a, b) => a.number - b.number),
    }))
    .filter((section) => section.lines.length > 0);
}

/**
 * The add-ons on the bill as the whole-order ticket shows them above the
 * total: the name, its percentage when it is one, and what it came to.
 */
export function billLines(order: Pick<Order, "addons">): { id: string; nameEn: string; nameZh: string; rate: string; amount: string }[] {
  return (order.addons ?? []).map((addon) => ({
    id: addon.id,
    nameEn: addon.nameEn,
    nameZh: addon.nameZh,
    rate: addon.kind === "percent" ? percentText(addon.value) : "",
    amount: signedPence(addon.amountPence),
  }));
}
