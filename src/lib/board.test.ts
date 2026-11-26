import { describe, expect, it } from "vitest";
import { checkBoard, columnName, columnOf, DEFAULT_BOARD, nextStep, planMoves, startFor, type Board } from "./board";
import type { Order } from "./types";

const packing: Board = {
  columns: [
    DEFAULT_BOARD.columns[0],
    DEFAULT_BOARD.columns[1],
    { id: "packing", nameEn: "Packing", nameZh: "", role: "in_progress", colour: "#7a4fd0" },
    DEFAULT_BOARD.columns[2],
    DEFAULT_BOARD.columns[3],
  ],
};

const order = (id: string, status: Order["status"], column?: string): Order =>
  ({ id, number: 1, status, column: column ?? null, fulfilment: "collection", source: "counter" }) as Order;

describe("the orders board", () => {
  it("puts an order without a column in the first column for its status", () => {
    expect(columnOf(packing, order("a", "preparing"))?.id).toBe("preparing");
    expect(columnOf(packing, order("b", "preparing", "packing"))?.id).toBe("packing");
    expect(columnOf(packing, order("c", "ready", "packing"))?.id).toBe("ready");
    expect(columnOf(packing, order("d", "cancelled"))).toBeNull();
  });

  it("starts counter orders in the first in-progress column and online ones in incoming", () => {
    expect(startFor(packing, "counter").id).toBe("preparing");
    expect(startFor(packing, "online").id).toBe("new");
  });

  it("moves one column at a time, with the right words", () => {
    expect(nextStep(packing, order("a", "new"))).toMatchObject({ kind: "accept", column: { id: "preparing" } });
    expect(nextStep(packing, order("a", "preparing", "preparing"))).toMatchObject({ kind: "move", column: { id: "packing" } });
    expect(nextStep(packing, order("a", "preparing", "packing"))).toMatchObject({ kind: "ready", column: { id: "ready" } });
    expect(nextStep(packing, order("a", "ready"))).toMatchObject({ kind: "done", column: { id: "completed" } });
    expect(nextStep(packing, order("a", "completed"))).toBeNull();
  });

  it("names a column in the other language when one is empty", () => {
    expect(columnName(packing.columns[2], "zh-Hant")).toBe("Packing");
    expect(columnName(DEFAULT_BOARD.columns[0], "zh-Hant")).toBe("新單");
  });

  it("refuses boards that break the flow, like the server", () => {
    expect(() => checkBoard({ columns: [DEFAULT_BOARD.columns[0], DEFAULT_BOARD.columns[3]] })).toThrow(/at least one ready/);
    expect(() => checkBoard({ columns: [DEFAULT_BOARD.columns[2], ...DEFAULT_BOARD.columns] })).toThrow();
    expect(checkBoard(packing).columns).toHaveLength(5);
  });

  it("moves tickets from a removed column one to the left, never back a step", () => {
    const { moves, stuck } = planMoves(packing, DEFAULT_BOARD, [order("a", "preparing", "packing"), order("b", "preparing", "preparing")]);
    expect(moves).toEqual([{ orderId: "a", from: "packing", to: "preparing" }]);
    expect(stuck).toBe(0);
    const bare = { columns: DEFAULT_BOARD.columns.filter((column) => column.id !== "preparing") };
    expect(planMoves(DEFAULT_BOARD, bare, [order("c", "preparing")]).stuck).toBe(1);
  });
});
