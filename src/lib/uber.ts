import { DanError } from "./errors";
import type { Courier, Order } from "./types";

/** When an Uber courier is booked for an order. */
export type UberBooking = "on_accept" | "on_ready" | "manual";

/** The owner's Uber Direct options. `connected` and `accountHint` are set by the Dan cloud. */
export type UberOptions = {
  connected: boolean;
  accountHint: string;
  booking: UberBooking;
  cookMinutes: number;
  feeAdjustPence: number;
  freeOverPence: number | null;
  minimumPence: number | null;
  pickupPostcode: string;
};

export type UberOptionsInput = Omit<UberOptions, "connected" | "accountHint">;

export type UberKeys = {
  customerId: string;
  clientId: string;
  clientSecret: string;
  webhookSigningKey: string;
};

export const DEFAULT_UBER: UberOptions = {
  connected: false,
  accountHint: "",
  booking: "on_accept",
  cookMinutes: 15,
  feeAdjustPence: 0,
  freeOverPence: null,
  minimumPence: null,
  pickupPostcode: "",
};

export const UBER_FIELDS = "connected accountHint booking cookMinutes feeAdjustPence freeOverPence minimumPence pickupPostcode";

/** Checks the owner's options as the server does, with its words. */
export function checkUberOptions(input: UberOptionsInput) {
  if (!Number.isInteger(input.cookMinutes) || input.cookMinutes < 5 || input.cookMinutes > 120) {
    throw new DanError("invalid", "The cooking time is 5 to 120 minutes.");
  }
  if (!Number.isInteger(input.feeAdjustPence) || Math.abs(input.feeAdjustPence) > 1000) {
    throw new DanError("invalid", "The change to Uber's fee is from -£10 to +£10.");
  }
  for (const pence of [input.freeOverPence, input.minimumPence]) {
    if (pence !== null && (!Number.isInteger(pence) || pence < 0 || pence > 10_000)) throw new DanError("invalid", "Amounts are from £0 to £100.");
  }
}

/** Where the shop's Uber webhook goes: the Dan cloud's one address, by the shop's address name (DAN-45). */
export function webhookAddress(cloudUrl: string | null | undefined, addressName: string | null | undefined): string | null {
  if (!cloudUrl || !addressName || !/^[a-z0-9-]{1,40}$/.test(addressName)) return null;
  try {
    const url = new URL(cloudUrl);
    return `${url.origin}/webhooks/uber/${addressName}`;
  } catch {
    return null;
  }
}

/** How far the courier has got, as the docket says it. */
export type CourierStage = "booking" | "booked" | "to_shop" | "with_food" | "delivered" | "cancelled" | "returned" | "failed";

export function courierStage(courier: Courier | null | undefined): CourierStage | null {
  if (!courier) return null;
  switch (courier.status) {
    case "pending":
      return "booked";
    case "pickup":
      return "to_shop";
    case "pickup_complete":
    case "dropoff":
      return "with_food";
    case "delivered":
      return "delivered";
    case "canceled":
      return "cancelled";
    case "returned":
      return "returned";
    case "failed":
      return "failed";
    default:
      return courier.deliveryId ? "booked" : "booking";
  }
}

/** Booked and not finished or called off. */
export function courierActive(courier: Courier | null | undefined): boolean {
  return Boolean(courier?.deliveryId) && !["delivered", "canceled", "returned"].includes(courier?.status ?? "");
}

export function finished(order: Order): boolean {
  return order.status === "completed" || order.status === "cancelled";
}

/** A short clock time ("19:30") from Uber's RFC 3339 time, or "". */
export function clock(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
}
