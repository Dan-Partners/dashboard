import { describe, expect, it } from "vitest";
import {
  DONE_SHOWN_MS,
  kitchenTickets,
  newDoneMemory,
  normalizeFocus,
  normalizeStations,
  pickStation,
  noteOrders,
  passOrders,
  toggleStation,
} from "./focus";
import type { Order, OrderLine, OrderStatus, Station } from "./types";

const line = (number: number, station: Station): OrderLine => ({
  itemId: `item-${number}`,
  number,
  nameEn: `Dish ${number}`,
  nameZh: `菜${number}`,
  qty: 1,
  unitPricePence: 500,
  station,
  kind: "item",
  components: [],
});

const order = (id: string, status: OrderStatus, minutesAgo: number, lines: OrderLine[], now: number): Order => ({
  id,
  number: 1,
  createdAt: new Date(now - minutesAgo * 60_000).toISOString(),
  source: "counter",
  fulfilment: "collection",
  status,
  customerName: "",
  phone: "",
  address: "",
  notes: "",
  lines,
  totalPence: 500,
});

describe("the saved lock", () => {
  it("keeps only a known position", () => {
    expect(normalizeFocus({ position: "kitchen" })).toEqual({ position: "kitchen" });
    expect(normalizeFocus({ position: "office" })).toBeNull();
    expect(normalizeFocus("kitchen")).toBeNull();
    expect(normalizeFocus(null)).toBeNull();
  });
});

describe("the station filter", () => {
  it("keeps known stations in kitchen order, and falls back to all", () => {
    expect(normalizeStations(["rice", "wok", "oven"])).toEqual(["wok", "rice"]);
    expect(normalizeStations([])).toEqual(["wok", "fryer", "rice", "counter"]);
    expect(normalizeStations("wok")).toEqual(["wok", "fryer", "rice", "counter"]);
  });

  it("never turns the last station off", () => {
    expect(toggleStation(["wok", "fryer"], "wok")).toEqual(["fryer"]);
    expect(toggleStation(["fryer"], "fryer")).toEqual(["fryer"]);
    expect(toggleStation(["rice"], "wok")).toEqual(["wok", "rice"]);
  });

  it("from all stations, a tap picks just that one", () => {
    expect(pickStation(["wok", "fryer", "rice", "counter"], "fryer")).toEqual(["fryer"]);
    expect(pickStation(["fryer"], "wok")).toEqual(["wok", "fryer"]);
  });
});

describe("the kitchen screen", () => {
  const now = Date.parse("2026-11-25T18:00:00Z");

  it("lists open orders oldest first, and keeps the others' tickets, only marked", () => {
    const orders = [
      order("b", "new", 2, [line(1, "fryer")], now),
      order("a", "preparing", 9, [line(2, "wok"), line(3, "rice")], now),
      order("c", "ready", 5, [line(4, "wok")], now),
    ];
    const memory = newDoneMemory();
    noteOrders(memory, orders, now);
    const tickets = kitchenTickets(orders, ["wok"], memory, now);
    expect(tickets.map((ticket) => ticket.order.id)).toEqual(["a", "c", "b"]);
    expect(tickets.map((ticket) => ticket.forPicked)).toEqual([true, true, false]);
    expect(tickets[0].sections.map((section) => section.station)).toEqual(["wok", "rice"]);
  });

  it("keeps a done order for 15 minutes from when this tablet saw it finish", () => {
    const memory = newDoneMemory();
    const placedLongAgo = order("x", "preparing", 60, [line(1, "wok")], now);
    noteOrders(memory, [placedLongAgo], now);
    const done = { ...placedLongAgo, status: "completed" as const };
    noteOrders(memory, [done], now);
    expect(kitchenTickets([done], ["wok"], memory, now + DONE_SHOWN_MS - 1000)).toHaveLength(1);
    expect(kitchenTickets([done], ["wok"], memory, now + DONE_SHOWN_MS)).toHaveLength(0);
  });

  it("after a reload, counts a done order from when it was placed", () => {
    const memory = newDoneMemory();
    const recent = order("r", "completed", 5, [line(1, "wok")], now);
    const old = order("o", "completed", 40, [line(1, "wok")], now);
    noteOrders(memory, [recent, old], now);
    expect(kitchenTickets([recent, old], ["wok"], memory, now).map((ticket) => ticket.order.id)).toEqual(["r"]);
  });
});

describe("the pass", () => {
  it("shows ready orders only, oldest first", () => {
    const now = Date.now();
    const orders = [order("1", "ready", 1, [], now), order("2", "preparing", 9, [], now), order("3", "ready", 4, [], now)];
    expect(passOrders(orders).map((entry) => entry.id)).toEqual(["3", "1"]);
  });
});
