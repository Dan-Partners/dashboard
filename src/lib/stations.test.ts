import { describe, expect, it } from "vitest";
import { checkRemovals, checkStations, defaultStation, dishesByStation, newStationId, normalizeStations, stationGloss, stationName } from "./stations";
import { ticketSections } from "./ticket";
import { DEFAULT_STATIONS, type Order, type OrderLine, type Station } from "./types";

const OWN: Station[] = [
  { id: "bar", nameEn: "Bar", nameZh: "Bar" },
  { id: "wok", nameEn: "Hot line", nameZh: "熱線" },
];

describe("the shop's stations", () => {
  it("names a station in the reader's language, once when it has one name", () => {
    expect(stationName(OWN, "wok", "en")).toBe("Hot line");
    expect(stationName(OWN, "wok", "zh-Hant")).toBe("熱線");
    expect(stationGloss(OWN, "wok", "en")).toBe("熱線");
    expect(stationName(OWN, "bar", "zh-Hant")).toBe("Bar");
    expect(stationGloss(OWN, "bar", "zh-Hant")).toBe("");
    // A station that has gone shows its id; no station shows nothing.
    expect(stationName(OWN, "grill", "en")).toBe("grill");
    expect(stationGloss(OWN, "grill", "en")).toBe("");
    expect(stationName(OWN, "", "en")).toBe("");
  });

  it("starts a new dish on the counter, else the first station, else none", () => {
    expect(defaultStation(DEFAULT_STATIONS)).toBe("counter");
    expect(defaultStation(OWN)).toBe("bar");
    expect(defaultStation([])).toBe("");
  });

  it("makes a new station's id from its name, and never one already used", () => {
    expect(newStationId("Cold Bar", [])).toBe("cold-bar");
    expect(newStationId("Bar", ["bar"])).toBe("bar-2");
    expect(newStationId("燒烤", [])).toBe("station");
    expect(newStationId("燒烤", ["station", "station-2"])).toBe("station-3");
  });

  it("checks a list as the server does", () => {
    expect(checkStations([{ id: " bar ", nameEn: "", nameZh: "酒吧" }])).toEqual([{ id: "bar", nameEn: "酒吧", nameZh: "酒吧" }]);
    expect(checkStations([])).toEqual([]);
    const code = (list: Station[]) => {
      try {
        checkStations(list);
        return null;
      } catch (error) {
        return (error as { code: string }).code;
      }
    };
    expect(code([{ id: "bar", nameEn: "", nameZh: "" }])).toBe("stations_name");
    expect(code([{ id: "bar", nameEn: "x".repeat(25), nameZh: "" }])).toBe("stations_name");
    expect(code([{ id: "Bar", nameEn: "Bar", nameZh: "" }])).toBe("stations_ids");
    expect(code([OWN[0], OWN[0]])).toBe("stations_ids");
    expect(code(Array.from({ length: 13 }, (_, n) => ({ id: `s${n}`, nameEn: "S", nameZh: "" })))).toBe("stations_size");
    expect(normalizeStations("nonsense", DEFAULT_STATIONS)).toBe(DEFAULT_STATIONS);
    expect(normalizeStations([], DEFAULT_STATIONS)).toEqual([]);
  });

  it("refuses to drop a station dishes still use", () => {
    const items = [{ station: "wok" }, { station: "wok" }, { station: "" }];
    expect(dishesByStation(items).get("wok")).toBe(2);
    expect(() => checkRemovals(OWN, [OWN[0]], items)).toThrow(/Hot line is still on 2 dishes/);
    expect(() => checkRemovals(OWN, [OWN[1]], items)).not.toThrow();
  });
});

describe("a ticket's sections", () => {
  const line = (number: number, station: string): OrderLine => ({
    itemId: `item-${number}`,
    number,
    nameEn: `Dish ${number}`,
    nameZh: `菜${number}`,
    qty: 1,
    unitPricePence: 100,
    station,
    kind: "item",
    components: [],
  });
  const order = (lines: OrderLine[]) => ({ lines }) as Order;

  it("reads in the owner's order, then stations that have gone, then dishes with none", () => {
    const sections = ticketSections(order([line(1, "wok"), line(2, "grill"), line(3, ""), line(4, "bar")]), OWN);
    expect(sections.map((section) => [section.station, section.lines.map((entry) => entry.number)])).toEqual([
      ["bar", [4]],
      ["wok", [1]],
      ["grill", [2]],
      ["", [3]],
    ]);
  });

  it("is one plain list for a shop with no stations", () => {
    const sections = ticketSections(order([line(2, ""), line(1, "")]), []);
    expect(sections).toHaveLength(1);
    expect(sections[0].lines.map((entry) => entry.number)).toEqual([1, 2]);
  });
});
