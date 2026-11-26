import { DanError } from "./errors";

/**
 * How a shop takes orders and payment, set by the owner. The shop server
 * holds it and refuses what is off; this mirrors its checks for the demo and
 * so the screen can say what is wrong before saving.
 */
export type OrderingSettings = {
  till: boolean;
  table: boolean;
  collection: boolean;
  delivery: boolean;
  uberDirect: boolean;
  payInPerson: boolean;
  stripe: boolean;
  bankTransfer: boolean;
  /** The shop's own delivery fee and minimum order, in pence. */
  deliveryFeePence: number | null;
  deliveryMinimumPence: number | null;
};

export type BankDetails = {
  accountName: string;
  /** Six digits, without dashes. */
  sortCode: string;
  accountNumber: string;
  referencePrefix: string;
};

export type OrderingSetup = {
  settings: OrderingSettings;
  bank: BankDetails | null;
  /** Uber Direct can be switched on (its account is connected). */
  uberReady: boolean;
};

/** A new shop and the Golden Dragon demo: what v0.1 has always offered. */
export const DEFAULT_ORDERING: OrderingSettings = {
  till: true,
  table: true,
  collection: true,
  delivery: false,
  uberDirect: false,
  payInPerson: true,
  stripe: true,
  bankTransfer: false,
  deliveryFeePence: null,
  deliveryMinimumPence: null,
};

export const DEFAULT_SETUP: OrderingSetup = { settings: DEFAULT_ORDERING, bank: null, uberReady: false };

export const MAX_DELIVERY_PENCE = 10_000;

export const ORDER_METHODS = ["till", "table", "collection", "delivery", "uberDirect"] as const;
export const PAYMENT_METHODS = ["payInPerson", "stripe", "bankTransfer"] as const;

export function online(settings: OrderingSettings): boolean {
  return settings.table || settings.collection || settings.delivery || settings.uberDirect;
}

/** Tidies and checks bank details, or says what is wrong (the server's codes). */
export function checkedBank(bank: BankDetails): BankDetails {
  const digits = (value: string) => value.replace(/[\s-]/g, "");
  const accountName = bank.accountName.trim().split(/\s+/).join(" ");
  if (!accountName || [...accountName].length > 70) throw new DanError("bank_name", "Enter the name on the bank account, up to 70 characters.");
  const sortCode = digits(bank.sortCode);
  if (!/^\d{6}$/.test(sortCode)) throw new DanError("bank_sort_code", "A sort code is six digits, such as 12-34-56.");
  const accountNumber = digits(bank.accountNumber);
  if (!/^\d{8}$/.test(accountNumber)) throw new DanError("bank_account_number", "A UK account number is eight digits.");
  const referencePrefix = bank.referencePrefix.trim().toUpperCase();
  if (!/^[A-Z0-9]{0,6}$/.test(referencePrefix)) {
    throw new DanError("bank_reference_prefix", "The reference prefix is up to six letters or numbers, such as GD.");
  }
  return { accountName, sortCode, accountNumber, referencePrefix };
}

export function bankIsEmpty(bank: BankDetails | null): boolean {
  return !bank || (!bank.accountName.trim() && !bank.sortCode.trim() && !bank.accountNumber.trim());
}

/** The server's checks on a whole set of settings, with its codes. */
export function checkOrdering(settings: OrderingSettings, bank: BankDetails | null, uberReady: boolean) {
  if (!(settings.till || online(settings))) throw new DanError("no_order_method", "Keep at least one way to order switched on.");
  if (!(settings.payInPerson || settings.stripe || settings.bankTransfer)) {
    throw new DanError("no_payment_method", "Keep at least one way to pay switched on.");
  }
  for (const pence of [settings.deliveryFeePence, settings.deliveryMinimumPence]) {
    if (pence !== null && (pence < 0 || pence > MAX_DELIVERY_PENCE || !Number.isInteger(pence))) {
      throw new DanError("invalid", "The delivery fee and minimum order are from £0 to £100.");
    }
  }
  if (settings.delivery && (settings.deliveryFeePence === null || settings.deliveryMinimumPence === null)) {
    throw new DanError("delivery_needs_fee", "Set the delivery fee and the minimum order (either may be £0) before switching delivery on.");
  }
  if (settings.uberDirect && !uberReady) {
    throw new DanError("uber_not_set_up", "Connect the shop's Uber Direct account before switching Uber Direct on.");
  }
  if (settings.bankTransfer && bankIsEmpty(bank)) {
    throw new DanError("bank_details_needed", "Enter the shop's bank details before switching bank transfer on.");
  }
}

/** Reads a saved setup leniently: anything missing is the default. */
export function normalizeSetup(value: unknown): OrderingSetup {
  if (!value || typeof value !== "object") return DEFAULT_SETUP;
  const record = value as Partial<OrderingSetup>;
  const raw = (record.settings ?? {}) as Partial<OrderingSettings>;
  const flag = (key: keyof OrderingSettings) => (typeof raw[key] === "boolean" ? (raw[key] as boolean) : (DEFAULT_ORDERING[key] as boolean));
  const pence = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_DELIVERY_PENCE ? v : null);
  const settings: OrderingSettings = {
    till: flag("till"),
    table: flag("table"),
    collection: flag("collection"),
    delivery: flag("delivery"),
    uberDirect: false,
    payInPerson: flag("payInPerson"),
    stripe: flag("stripe"),
    bankTransfer: flag("bankTransfer"),
    deliveryFeePence: pence(raw.deliveryFeePence),
    deliveryMinimumPence: pence(raw.deliveryMinimumPence),
  };
  let bank: BankDetails | null = null;
  try {
    bank = record.bank ? checkedBank(record.bank as BankDetails) : null;
  } catch {
    bank = null;
  }
  // A saved set that no longer passes falls back to the defaults, never to nothing.
  try {
    checkOrdering(settings, bank, false);
    return { settings, bank, uberReady: false };
  } catch {
    return { ...DEFAULT_SETUP, bank };
  }
}

export function sortCodeDisplay(sortCode: string): string {
  return /^\d{6}$/.test(sortCode) ? `${sortCode.slice(0, 2)}-${sortCode.slice(2, 4)}-${sortCode.slice(4)}` : sortCode;
}
