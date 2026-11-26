import type { Order, Station, TicketComponent } from "./types";

export type TicketLine = {
  number: number;
  nameEn: string;
  nameZh: string;
  qty: number;
  station: string;
};

export type TicketSection = {
  /** The station's id; "" for dishes with no station. */
  station: string;
  lines: TicketLine[];
};

/**
 * An order's dishes by station, set meals opened up into their dishes. The
 * shop's stations come first, in the owner's order; then any station an
 * older order names that has since gone; then dishes with no station.
 */
export function ticketSections(order: Order, stations: Station[]): TicketSection[] {
  const merged = new Map<string, TicketLine>();

  const add = (line: TicketComponent) => {
    const key = `${line.station}:${line.number}`;
    const existing = merged.get(key);
    if (existing) {
      existing.qty += line.qty;
      return;
    }
    merged.set(key, { ...line });
  };

  for (const line of order.lines) {
    if (line.components.length > 0) {
      for (const component of line.components) add(component);
    } else {
      add({
        number: line.number,
        nameEn: line.nameEn,
        nameZh: line.nameZh,
        qty: line.qty,
        station: line.station,
      });
    }
  }

  const lines = [...merged.values()];
  const order_of = stations.map((station) => station.id);
  for (const line of lines) if (line.station && !order_of.includes(line.station)) order_of.push(line.station);
  order_of.push("");
  return order_of
    .map((station) => ({
      station,
      lines: lines.filter((line) => (line.station ?? "") === station).sort((a, b) => a.number - b.number),
    }))
    .filter((section) => section.lines.length > 0);
}
