import { describe, expect, it } from "vitest";
import {
  comingTo,
  DONE_SHOWN_MS,
  focusRoute,
  kitchenTickets,
  newDoneMemory,
  normalizeFocus,
  normalizeStations,
  pickedStations,
  pickStation,
  noteOrders,
  passOrders,
  toggleStation,
} from "./focus";
import { DEFAULT_BOARD } from "./board";
import { DEFAULT_STATIONS, type Order, type OrderLine, type OrderStatus, type Station } from "./types";

/** The four a shop starts with, and a shop that named its own. */
const FOUR = DEFAULT_STATIONS;
const OWN: Station[] = [
  { id: "bar", nameEn: "Bar", nameZh: "Bar" },
  { id: "grill", nameEn: "Grill", nameZh: "燒烤" },
];

const line = (number: number, station: string): OrderLine => ({
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
  it("keeps a view, the till or the orders board, and nothing else", () => {
    expect(normalizeFocus({ position: "view", view: "packing" })).toEqual({ position: "view", view: "packing" });
    expect(normalizeFocus({ position: "till" })).toEqual({ position: "till" });
    expect(normalizeFocus({ position: "board" })).toEqual({ position: "board" });
    expect(normalizeFocus({ position: "view" })).toBeNull();
    expect(normalizeFocus({ position: "view", view: "../x" })).toBeNull();
    expect(normalizeFocus({ position: "office" })).toBeNull();
    expect(normalizeFocus("kitchen")).toBeNull();
    expect(normalizeFocus(null)).toBeNull();
  });

  it("reads a tablet locked before views as locked to the view with that id", () => {
    expect(normalizeFocus({ position: "kitchen" })).toEqual({ position: "view", view: "kitchen" });
    expect(normalizeFocus({ position: "pass" })).toEqual({ position: "view", view: "pass" });
    expect(focusRoute({ position: "view", view: "kitchen" })).toBe("/shop/view/kitchen");
    expect(focusRoute({ position: "till" })).toBe("/shop/till");
    expect(focusRoute({ position: "board" })).toBe("/shop/orders");
  });
});

describe("the station filter", () => {
  it("keeps a tablet's picked stations as ids, and nothing picked means all", () => {
    expect(normalizeStations(["rice", "wok", 7, "rice"])).toEqual(["rice", "wok"]);
    expect(normalizeStations("wok")).toEqual([]);
    // Shown in the shop's order; ones the shop no longer has are left out.
    expect(pickedStations(["rice", "wok", "oven"], FOUR)).toEqual(["wok", "rice"]);
    expect(pickedStations([], FOUR)).toEqual(["wok", "fryer", "rice", "counter"]);
    // A tablet that picked a station the owner has since removed shows all again.
    expect(pickedStations(["oven"], OWN)).toEqual(["bar", "grill"]);
    // What older tablets saved (all four) still means all.
    expect(pickedStations(["wok", "fryer", "rice", "counter"], FOUR)).toHaveLength(4);
    expect(pickedStations(["wok"], [])).toEqual([]);
  });

  it("never turns the last station off", () => {
    expect(toggleStation(["wok", "fryer"], "wok", FOUR)).toEqual(["fryer"]);
    expect(toggleStation(["fryer"], "fryer", FOUR)).toEqual(["fryer"]);
    expect(toggleStation(["rice"], "wok", FOUR)).toEqual(["wok", "rice"]);
  });

  it("from all stations, a tap picks just that one, and picking them all is all again", () => {
    expect(pickStation([], "fryer", FOUR)).toEqual(["fryer"]);
    expect(pickStation(["fryer"], "wok", FOUR)).toEqual(["wok", "fryer"]);
    expect(pickStation(["bar"], "grill", OWN)).toEqual([]);
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
    const tickets = kitchenTickets(orders, ["wok"], FOUR, memory, now);
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
    expect(kitchenTickets([done], ["wok"], FOUR, memory, now + DONE_SHOWN_MS - 1000)).toHaveLength(1);
    expect(kitchenTickets([done], ["wok"], FOUR, memory, now + DONE_SHOWN_MS)).toHaveLength(0);
  });

  it("after a reload, counts a done order from when it was placed", () => {
    const memory = newDoneMemory();
    const recent = order("r", "completed", 5, [line(1, "wok")], now);
    const old = order("o", "completed", 40, [line(1, "wok")], now);
    noteOrders(memory, [recent, old], now);
    expect(kitchenTickets([recent, old], ["wok"], FOUR, memory, now).map((ticket) => ticket.order.id)).toEqual(["r"]);
  });
});

describe("a view's part of the board", () => {
  const now = Date.parse("2026-11-25T18:00:00Z");
  const at = (id: string, status: OrderStatus, column: string, minutesAgo: number): Order => ({ ...order(id, status, minutesAgo, [line(1, "wok")], now), column });
  const orders = [
    at("new-1", "new", "new", 1),
    at("prep-1", "preparing", "preparing", 8),
    at("prep-2", "preparing", "preparing", 3),
    at("ready-1", "ready", "ready", 5),
    at("done-1", "completed", "completed", 20),
  ];

  it("shows a make view only the tickets in its columns, oldest first", () => {
    const memory = newDoneMemory();
    noteOrders(memory, orders, now);
    const prep = kitchenTickets(orders, [], FOUR, memory, now, { board: DEFAULT_BOARD, columns: ["preparing"] });
    expect(prep.map((ticket) => ticket.order.id)).toEqual(["prep-1", "prep-2"]);
    // A bench in the middle of the flow does not see tickets again when they finish.
    const finished = { ...orders[1], status: "completed" as const, column: "completed" };
    noteOrders(memory, [finished], now);
    expect(kitchenTickets([finished], [], FOUR, memory, now, { board: DEFAULT_BOARD, columns: ["preparing"] })).toHaveLength(0);
    // The kitchen, which shows the ready column, keeps a just-finished ticket for 15 minutes.
    expect(kitchenTickets([finished], [], FOUR, memory, now, { board: DEFAULT_BOARD, columns: ["new", "preparing", "ready"] })).toHaveLength(1);
    // A view with no columns shows nothing.
    expect(kitchenTickets(orders, [], FOUR, memory, now, { board: DEFAULT_BOARD, columns: [] })).toHaveLength(0);
  });

  it("shows a hand-over view its columns' tickets, and counts the ones still on their way", () => {
    const pass = { board: DEFAULT_BOARD, columns: ["ready"] };
    expect(passOrders(orders, pass).map((entry) => entry.id)).toEqual(["ready-1"]);
    expect(comingTo(orders, pass)).toBe(3);
    const packing = { board: DEFAULT_BOARD, columns: ["preparing"] };
    expect(passOrders(orders, packing).map((entry) => entry.id)).toEqual(["prep-1", "prep-2"]);
    expect(comingTo(orders, packing)).toBe(1);
    expect(comingTo(orders, { board: DEFAULT_BOARD, columns: [] })).toBe(0);
  });
});

describe("the pass", () => {
  it("shows ready orders only, oldest first", () => {
    const now = Date.now();
    const orders = [order("1", "ready", 1, [], now), order("2", "preparing", 9, [], now), order("3", "ready", 4, [], now)];
    expect(passOrders(orders).map((entry) => entry.id)).toEqual(["3", "1"]);
  });
});
