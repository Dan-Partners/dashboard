import type { Order, Station, TicketComponent } from "./types";

export type TicketLine = {
  number: number;
  nameEn: string;
  nameZh: string;
  qty: number;
  station: Station;
};

export type TicketSection = {
  station: Station;
  lines: TicketLine[];
};

const STATION_ORDER: Station[] = ["wok", "fryer", "rice", "counter"];

export function ticketSections(order: Order): TicketSection[] {
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

  return STATION_ORDER.map((station) => ({
    station,
    lines: [...merged.values()]
      .filter((line) => line.station === station)
      .sort((a, b) => a.number - b.number),
  })).filter((section) => section.lines.length > 0);
}
