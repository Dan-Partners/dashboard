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
  /** Customers can pay by card. */
  cardPayments: boolean;
};

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
