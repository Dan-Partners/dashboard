import { describe, expect, it } from "vitest";
import { MockDanServer } from "./mock-server";
import { applyEdit, courierBooked, paidDifference } from "./order-edit";
import { createSeedState } from "./seed";
import type { MenuItem, Order } from "./types";

const state = createSeedState(new Date("2026-11-26T19:00:00Z"));
const menu: MenuItem[] = state.items;
const price = (number: number) => menu.find((item) => item.number === number)!.pricePence;

function placed(lines: [number, number][], patch: Partial<Order> = {}): Order {
  const made = lines.map(([number, qty]) => {
    const item = menu.find((entry) => entry.number === number)!;
    return { itemId: item.id, number, nameEn: item.nameEn, nameZh: item.nameZh, qty, unitPricePence: item.pricePence, station: item.station, kind: item.kind, components: [] };
  });
  return {
    id: "o1",
    number: 12,
    createdAt: "2026-11-26T18:00:00.000Z",
    source: "phone",
    fulfilment: "collection",
    status: "preparing",
    customerName: "Mrs Wong",
    phone: "07700 900123",
    address: "",
    notes: "",
    lines: made,
    totalPence: made.reduce((sum, line) => sum + line.qty * line.unitPricePence, 0),
    ...patch,
  };
}
const code = (run: () => unknown) => {
  try {
    run();
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code ?? "?";
  }
};

describe("the owner's change to an order, by the server's rules", () => {
  it("notes each detail before and after, and leaves the bill alone", () => {
    const order = placed([[81, 1]]);
    const applied = applyEdit(order, { customerName: "  Mr Wong ", phone: "07700 900123", notes: "No onions" }, menu, false);
    expect(applied.changes).toEqual([
      { field: "customerName", before: "Mrs Wong", after: "Mr Wong" },
      { field: "notes", before: "", after: "No onions" },
    ]);
    expect(applied.lines).toEqual([]);
    expect(applied.order.editCount).toBe(1);
    expect(applied.order.totalPence).toBe(order.totalPence);
  });

  it("changes nothing when nothing differs, whatever order the dishes are listed in", () => {
    const order = placed([[81, 2], [1, 1]]);
    const same = applyEdit(order, { customerName: "Mrs Wong", lines: [{ number: 1, qty: 1 }, { number: 81, qty: 2 }] }, menu, false);
    expect(same.changes).toEqual([]);
    expect(same.lines).toEqual([]);
    expect(same.order).toEqual(order);
  });

  it("keeps the price a dish was sold at, and prices an added dish from the menu now", () => {
    const order = placed([[81, 2], [1, 1]]);
    const dearer = menu.map((item) => (item.number === 81 ? { ...item, pricePence: item.pricePence + 100 } : item));
    const applied = applyEdit(order, { lines: [{ number: 81, qty: 3 }, { number: 3, qty: 2 }] }, dearer, false);
    expect(applied.order.lines.map((line) => [line.number, line.qty, line.unitPricePence])).toEqual([
      [81, 3, price(81)],
      [3, 2, price(3)],
    ]);
    expect(applied.order.totalPence).toBe(3 * price(81) + 2 * price(3));
    expect(applied.lines.map((line) => [line.number, line.beforeQty, line.afterQty])).toEqual([
      [1, 1, 0],
      [3, 0, 2],
      [81, 2, 3],
    ]);
  });

  it("checks the list of dishes", () => {
    const order = placed([[81, 1]]);
    const edit = (lines: { number: number; qty: number }[], from = menu) => code(() => applyEdit(order, { lines }, from, false));
    expect(edit([])).toBe("invalid");
    expect(edit([{ number: 81, qty: 0 }])).toBe("invalid");
    expect(edit([{ number: 81, qty: 100 }])).toBe("invalid");
    expect(edit([{ number: 81, qty: 1 }, { number: 81, qty: 2 }])).toBe("invalid");
    expect(edit([{ number: 81, qty: 1 }, { number: 9999, qty: 1 }])).toBe("unknown_item");
    const soldOut = menu.map((item) => ({ ...item, soldOut: true }));
    expect(edit([{ number: 81, qty: 1 }, { number: 3, qty: 1 }], soldOut)).toBe("sold_out");
    // A dish already on the order can still change when it has sold out since.
    expect(edit([{ number: 81, qty: 4 }], soldOut)).toBe("ok");
  });

  it("keeps what was taken beside the new bill of a paid order, and never touches payment", () => {
    const order = placed([[81, 2]], { payment: { method: "card", status: "paid" } });
    const more = applyEdit(order, { lines: [{ number: 81, qty: 3 }] }, menu, false).order;
    expect(more.paidPence).toBe(order.totalPence);
    expect(more.payment).toEqual(order.payment);
    expect(paidDifference(more)).toEqual({ paidPence: order.totalPence, differencePence: price(81) });
    const less = applyEdit(more, { lines: [{ number: 81, qty: 1 }] }, menu, false).order;
    expect(less.paidPence).toBe(order.totalPence);
    expect(paidDifference(less)).toEqual({ paidPence: order.totalPence, differencePence: -price(81) });
    // Back to what was paid: nothing to collect or refund.
    const back = applyEdit(less, { lines: [{ number: 81, qty: 2 }] }, menu, false).order;
    expect(paidDifference(back)).toBeNull();
    // Details alone, or an order not paid yet: nothing taken to keep.
    expect(applyEdit(order, { notes: "x" }, menu, false).order.paidPence).toBeUndefined();
    const due = placed([[81, 2]], { payment: { method: "at_shop", status: "due" } });
    expect(applyEdit(due, { lines: [{ number: 81, qty: 3 }] }, menu, false).order.paidPence).toBeUndefined();
    expect(paidDifference(placed([[81, 1]]))).toBeNull();
  });

  it("keeps a delivery fee in the bill, locks the address while a courier is booked, and keeps a delivery's address", () => {
    const base = placed([[81, 2]], { fulfilment: "delivery", address: "1 High St", deliveryFeePence: 250 });
    const order = { ...base, totalPence: base.totalPence + 250 };
    expect(applyEdit(order, { lines: [{ number: 81, qty: 1 }] }, menu, false).order.totalPence).toBe(price(81) + 250);
    expect(code(() => applyEdit(order, { address: "2 Low Rd" }, menu, true))).toBe("address_locked");
    expect(code(() => applyEdit(order, { address: "1 High St", notes: "Ring", lines: [{ number: 81, qty: 3 }] }, menu, true))).toBe("ok");
    expect(applyEdit(order, { address: "2 Low Rd" }, menu, false).order.address).toBe("2 Low Rd");
    expect(code(() => applyEdit(order, { address: " " }, menu, false))).toBe("invalid");
    expect(courierBooked({ courier: null })).toBe(false);
    const courier = { deliveryId: "del_1", status: "pickup", trackingUrl: "", feePence: 0, pickupEta: "", dropoffEta: "", courierName: "", problem: "" };
    expect(courierBooked({ courier })).toBe(true);
    expect(courierBooked({ courier: { ...courier, status: "delivered" } })).toBe(false);
    expect(courierBooked({ courier: { ...courier, deliveryId: "", status: "failed" } })).toBe(false);
  });

  it("gives only an eat-in order a table, and keeps one", () => {
    const eatIn = placed([[81, 1]], { fulfilment: "eat_in", table: "7" });
    expect(applyEdit(eatIn, { table: " Patio  2 " }, menu, false).order.table).toBe("Patio 2");
    expect(code(() => applyEdit(eatIn, { table: "" }, menu, false))).toBe("bad_table");
    expect(code(() => applyEdit(eatIn, { table: "<script>" }, menu, false))).toBe("bad_table");
    expect(code(() => applyEdit(placed([[81, 1]]), { table: "3" }, menu, false))).toBe("invalid");
  });

  it("leaves a cancelled order alone, and lets a completed one be corrected", () => {
    expect(code(() => applyEdit(placed([[81, 1]], { status: "cancelled" }), { notes: "x" }, menu, false))).toBe("order_cancelled");
    expect(code(() => applyEdit(placed([[81, 1]], { status: "completed" }), { notes: "x" }, menu, false))).toBe("ok");
  });
});

describe("the demo keeps the record as the shop server does", () => {
  it("records each change and each move, oldest first, and never the changes that changed nothing", async () => {
    const server = new MockDanServer({ state: createSeedState(new Date("2026-11-26T19:00:00Z")) });
    const { orders } = await server.getOrders();
    const order = orders.find((entry) => entry.status === "preparing")!;
    const first = order.lines[0];
    const edited = await server.editOrder(order.id, { customerName: "Changed Name", lines: [{ number: first.number, qty: first.qty + 1 }] });
    expect(edited.editCount).toBe(1);
    expect(edited.totalPence).toBeGreaterThan(0);
    await server.editOrder(order.id, { customerName: "Changed Name" });
    const moved = await server.moveOrderTo(order.id, "new");
    expect(moved.status).toBe("new");
    await server.moveOrderTo(order.id, "new");
    const reopened = await server.moveOrderTo((await server.moveOrderTo(order.id, "completed")).id, "ready");
    expect(reopened.status).toBe("ready");
    const record = await server.getOrderEdits(order.id);
    expect(record.map((entry) => entry.kind)).toEqual(["edit", "move", "move", "move"]);
    expect(record[0].changes[0]).toMatchObject({ field: "customerName", after: "Changed Name" });
    expect(record[1].changes).toEqual([{ field: "column", before: "Preparing", after: "New" }]);
    expect(record[3].changes).toEqual([{ field: "column", before: "Completed", after: "Ready" }]);
    expect((await server.getOrder(order.id)).status).toBe("ready");
    await expect(server.moveOrderTo(order.id, "attic")).rejects.toMatchObject({ code: "not_found" });
    await expect(server.getOrder("nope")).rejects.toMatchObject({ code: "not_found" });
  });
});
