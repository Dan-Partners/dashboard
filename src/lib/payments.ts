import { DanError } from "./errors";

/**
 * Card payments for the shop, through the Dan cloud (Stripe Connect). Owner
 * only, signed in to the cloud. Not part of DanClient: only the cloud has it.
 */
export type PaymentsStatus = {
  /** Dan's platform is set up, so the shop can connect. */
  available: boolean;
  /** The shop has started connecting a Stripe account. */
  connected: boolean;
  /** Customers can pay by card: the account is ready and the owner accepted Dan's terms. */
  cardPayments: boolean;
  /** The Stripe account can take charges. Missing from an older cloud. */
  accountReady?: boolean;
  /** Stripe is paying the takings out to the shop's bank; false while it holds them. Missing from an older cloud. */
  payoutsEnabled?: boolean;
  /** Dan's deal with the shop now. */
  deal?: Deal;
  /** Paid card orders so far. */
  cardOrdersPaid?: number;
  terms?: { version: string; text: string } | null;
  agreement?: Agreement | null;
  /** The terms or the deal changed since the owner last accepted (or never did). */
  needsAcceptance?: boolean;
};

export type Deal = { freeCardOrders: number; percentBp: number; capPence: number };
export type Agreement = { termsVersion: string; deal: Deal; ownerName: string; ownerEmail: string; acceptedAt: string };

/** "3" or "2.5", from basis points. */
export function percentText(bp: number): string {
  return (bp / 100).toFixed(2).replace(/\.?0+$/, "");
}

export function sameDeal(a: Deal | undefined | null, b: Deal | undefined | null): boolean {
  return Boolean(a && b && a.freeCardOrders === b.freeCardOrders && a.percentBp === b.percentBp && a.capPence === b.capPence);
}

/** The owner accepts the terms and deal they were shown. */
export function acceptTerms(cloudUrl: string, token: string, termsVersion: string, deal: Deal, name: string): Promise<PaymentsStatus> {
  return call<PaymentsStatus>(cloudUrl, token, "/payments/accept", { method: "POST", body: JSON.stringify({ termsVersion, deal, name }) });
}

async function call<T>(cloudUrl: string, token: string, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${cloudUrl}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
      cache: "no-store",
      credentials: "omit",
    });
  } catch {
    throw new DanError("unreachable", "The Dan cloud could not be reached.");
  }
  const body = (await response.json().catch(() => null)) as (T & { error?: { code?: string; message?: string } }) | null;
  if (!response.ok || !body) {
    throw new DanError(body?.error?.code ?? "unreachable", body?.error?.message ?? "The Dan cloud could not do that.");
  }
  return body;
}

export function getPayments(cloudUrl: string, token: string): Promise<PaymentsStatus> {
  return call<PaymentsStatus>(cloudUrl, token, "/payments");
}

/** Stripe's onboarding page for the shop; Stripe sends the owner back to `returnTo`. */
export async function connectPayments(cloudUrl: string, token: string, returnTo: string): Promise<string> {
  const body = await call<{ url: string }>(cloudUrl, token, "/payments/connect", {
    method: "POST",
    body: JSON.stringify({ returnTo }),
  });
  if (!/^https:\/\//.test(body.url)) throw new DanError("unreachable", "Stripe's link was not as expected.");
  return body.url;
}

/**
 * The shop server, bought by the owner (RK, 27 Nov 2026, DAN-35): the setup
 * once and a monthly fee, at Stripe's prices, on Dan's own Stripe account.
 * Paying does not switch it on: Dan does, once the machine is set up.
 */
export type ShopServerStatus = {
  /** The owner can buy it here (Dan's billing is set up and the shop lives in the cloud). */
  available: boolean;
  prices: { setupPence: number; setupWasPence: number | null; monthlyPence: number } | null;
  state: "none" | "paid" | "payment_failed" | "cancelling" | "ended";
  /** Switched on by Dan. */
  on: boolean;
  /** Switched on by Dan without the owner buying it. */
  withoutPayment: boolean;
  /** Set up on its own machine before DAN-34: nothing to buy. */
  ownMachine: boolean;
  periodEnd: string | null;
  endsAt: string | null;
  endedAt: string | null;
  /** The owner accepted the terms in force: needed to buy. */
  termsAccepted: boolean;
};

export function getShopServer(cloudUrl: string, token: string): Promise<ShopServerStatus> {
  return call<ShopServerStatus>(cloudUrl, token, "/shop-server");
}

/** Stripe Checkout for the setup and the first month; Stripe sends the owner back to `returnTo`. */
export function buyShopServer(cloudUrl: string, token: string, returnTo: string): Promise<string> {
  return stripePage(cloudUrl, token, "/shop-server/checkout", returnTo);
}

/** Stripe's own billing page: the card, cancelling. */
export function manageShopServer(cloudUrl: string, token: string, returnTo: string): Promise<string> {
  return stripePage(cloudUrl, token, "/shop-server/manage", returnTo);
}

async function stripePage(cloudUrl: string, token: string, path: string, returnTo: string): Promise<string> {
  const body = await call<{ url: string }>(cloudUrl, token, path, { method: "POST", body: JSON.stringify({ returnTo }) });
  if (!/^https:\/\//.test(body.url)) throw new DanError("unreachable", "Stripe's link was not as expected.");
  return body.url;
}
