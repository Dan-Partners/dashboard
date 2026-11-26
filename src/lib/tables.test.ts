import { describe, expect, it } from "vitest";
import { MAX_TABLES, normalizeOrderingAddress, orderingAddressFromCloud, parseTables, tableLink } from "./tables";

describe("tables as an owner writes them", () => {
  it("reads numbers, ranges and short names, in order, without repeats", () => {
    expect(parseTables("1-3, 20 A1,2")).toEqual(["1", "2", "3", "20", "A1"]);
    expect(parseTables("  ")).toEqual([]);
  });

  it("refuses what cannot be a table", () => {
    expect(() => parseTables("5-2")).toThrow("backwards");
    expect(() => parseTables("table#1")).toThrow('"table#1" is not a table');
    expect(() => parseTables("<b>")).toThrow("is not a table");
    expect(() => parseTables("A1-A9")).toThrow("is not a table");
    expect(() => parseTables(`1-${MAX_TABLES + 1}`)).toThrow(`Up to ${MAX_TABLES}`);
  });
});

describe("the ordering address", () => {
  it("comes from the cloud address, without /staff", () => {
    expect(orderingAddressFromCloud("https://goldendragon.dan.partners/staff")).toBe("https://goldendragon.dan.partners");
    expect(orderingAddressFromCloud(null)).toBe("");
  });

  it("is https and the address alone", () => {
    expect(normalizeOrderingAddress("order.goldendragon.co.uk/menu")).toBe("https://order.goldendragon.co.uk");
    expect(normalizeOrderingAddress("http://goldendragon.localhost:3001")).toBe("http://goldendragon.localhost:3001");
    expect(() => normalizeOrderingAddress("http://order.example")).toThrow("https://");
    expect(() => normalizeOrderingAddress("javascript:alert(1)")).toThrow();
  });

  it("puts the table in the link, safely", () => {
    expect(tableLink("https://goldendragon.dan.partners", "12")).toBe("https://goldendragon.dan.partners/?table=12");
    expect(tableLink("https://x.dan.partners", "A 1")).toBe("https://x.dan.partners/?table=A%201");
  });
});
