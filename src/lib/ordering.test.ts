import { describe, expect, it } from "vitest";
import { checkedBank, checkOrdering, DEFAULT_ORDERING, normalizeSetup, sortCodeDisplay, type OrderingSettings } from "./ordering";

const on = (patch: Partial<OrderingSettings>) => ({ ...DEFAULT_ORDERING, ...patch });
const bank = { accountName: " Golden  Dragon Ltd ", sortCode: "12-34-56", accountNumber: "1234 5678", referencePrefix: "gd" };
const codeOf = (fn: () => void) => {
  try {
    fn();
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

describe("order and payment methods", () => {
  it("default to what v0.1 offered", () => {
    expect(DEFAULT_ORDERING).toMatchObject({ till: true, table: true, collection: true, delivery: false, uberDirect: false, payInPerson: true, stripe: true, bankTransfer: false });
    expect(codeOf(() => checkOrdering(DEFAULT_ORDERING, null, false))).toBe("ok");
  });

  it("never leave nothing to order or pay with", () => {
    expect(codeOf(() => checkOrdering(on({ till: false, table: false, collection: false }), null, false))).toBe("no_order_method");
    expect(codeOf(() => checkOrdering(on({ table: false, collection: false }), null, false))).toBe("ok");
    expect(codeOf(() => checkOrdering(on({ payInPerson: false, stripe: false }), null, false))).toBe("no_payment_method");
  });

  it("need a delivery fee and minimum, Uber's account, and bank details first", () => {
    expect(codeOf(() => checkOrdering(on({ delivery: true }), null, false))).toBe("delivery_needs_fee");
    expect(codeOf(() => checkOrdering(on({ delivery: true, deliveryFeePence: 0, deliveryMinimumPence: 0 }), null, false))).toBe("ok");
    expect(codeOf(() => checkOrdering(on({ uberDirect: true }), null, false))).toBe("uber_not_set_up");
    expect(codeOf(() => checkOrdering(on({ bankTransfer: true }), null, false))).toBe("bank_details_needed");
    expect(codeOf(() => checkOrdering(on({ bankTransfer: true }), checkedBank(bank), false))).toBe("ok");
  });

  it("check bank details as the server does", () => {
    expect(checkedBank(bank)).toEqual({ accountName: "Golden Dragon Ltd", sortCode: "123456", accountNumber: "12345678", referencePrefix: "GD" });
    expect(codeOf(() => checkedBank({ ...bank, sortCode: "12345" }))).toBe("bank_sort_code");
    expect(codeOf(() => checkedBank({ ...bank, accountNumber: "1234567" }))).toBe("bank_account_number");
    expect(codeOf(() => checkedBank({ ...bank, referencePrefix: "G-D" }))).toBe("bank_reference_prefix");
    expect(sortCodeDisplay("123456")).toBe("12-34-56");
  });

  it("read back from storage leniently, never as nothing", () => {
    expect(normalizeSetup(null).settings).toEqual(DEFAULT_ORDERING);
    expect(normalizeSetup({ settings: { till: false, table: false, collection: false } }).settings).toEqual(DEFAULT_ORDERING);
    expect(normalizeSetup({ settings: { table: false } }).settings.table).toBe(false);
    expect(normalizeSetup({ settings: { uberDirect: true } }).settings.uberDirect).toBe(false);
  });
});
