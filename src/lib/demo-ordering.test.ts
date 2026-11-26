import { describe, expect, it } from "vitest";
import { MockDanServer } from "./mock-server";
import { DEFAULT_ORDERING } from "./ordering";

const counterOrder = { source: "counter" as const, fulfilment: "collection" as const, lines: [{ number: 81, qty: 1 }] };

describe("the demo shop's order and payment methods", () => {
  it("start as v0.1's offer and keep the shop server's rules", async () => {
    const server = new MockDanServer();
    expect((await server.getOrderingSettings()).settings).toEqual(DEFAULT_ORDERING);
    await expect(server.updateOrderingSettings({ ...DEFAULT_ORDERING, payInPerson: false, stripe: false })).rejects.toMatchObject({ code: "no_payment_method" });
    await expect(server.updateOrderingSettings({ ...DEFAULT_ORDERING, delivery: true })).rejects.toMatchObject({ code: "delivery_needs_fee" });
    await expect(server.updateOrderingSettings({ ...DEFAULT_ORDERING, bankTransfer: true })).rejects.toMatchObject({ code: "bank_details_needed" });
    const saved = await server.updateOrderingSettings(
      { ...DEFAULT_ORDERING, bankTransfer: true },
      { accountName: "Golden Dragon", sortCode: "12-34-56", accountNumber: "12345678", referencePrefix: "gd" },
    );
    expect(saved.bank).toMatchObject({ sortCode: "123456", referencePrefix: "GD" });
    // Kept in the demo's state (saved to this browser with it).
    expect(server.getState().ordering?.settings.bankTransfer).toBe(true);
  });

  it("refuses till orders when the till is off, and only drifts in online orders the shop takes", async () => {
    const server = new MockDanServer();
    await server.updateOrderingSettings({ ...DEFAULT_ORDERING, till: false });
    await expect(server.createOrder(counterOrder)).rejects.toMatchObject({ code: "till_off" });
    await server.updateOrderingSettings({ ...DEFAULT_ORDERING, collection: false });
    await expect(server.createOrder({ ...counterOrder, source: "online" })).rejects.toMatchObject({ code: "method_off" });
    await server.updateOrderingSettings({ ...DEFAULT_ORDERING, stripe: false });
    const online = await server.createOrder({ ...counterOrder, source: "online" });
    expect(online.payment?.method).toBe("at_shop");
  });
});
