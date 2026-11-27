import { DanError } from "./errors";
import { graphql } from "./graphql-client";

/**
 * Card payments for the shop, through the Dan cloud (Stripe Connect). Owner
 * only, signed in to the cloud. Not part of DanClient: only the cloud answers
 * these fields (DAN-43); a shop's own machine says `cloud_only`.
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
  /** The launch offer of the deal in force (DAN-41). Missing from an older cloud. */
  offer?: Offer | null;
};

export type Offer = {
  ordersPerMonth: number;
  /** When the offer ends: the shop's join date plus its months. */
  endsAt: string;
  /** Card orders paid this offer month, and when the month ends; null once the offer is over. */
  monthUsed: number | null;
  monthEndsAt: string | null;
};

/**
 * Dan's deal with a shop. Since DAN-41 the standard one comes from Stripe:
 * a percent plus a fixed amount, capped, with a launch offer of free card
 * orders each month for the shop's first months. The new fields are missing
 * from an older cloud, and from deals accepted before (read as 0).
 */
export type Deal = {
  freeCardOrders: number;
  percentBp: number;
  fixedPence?: number;
  capPence: number;
  offerOrdersPerMonth?: number;
  offerMonths?: number;
};
export type Agreement = { termsVersion: string; deal: Deal; ownerName: string; ownerEmail: string; acceptedAt: string };

/** "3" or "2.5", from basis points. */
export function percentText(bp: number): string {
  return (bp / 100).toFixed(2).replace(/\.?0+$/, "");
}

export function sameDeal(a: Deal | undefined | null, b: Deal | undefined | null): boolean {
  return Boolean(
    a &&
      b &&
      a.freeCardOrders === b.freeCardOrders &&
      a.percentBp === b.percentBp &&
      (a.fixedPence ?? 0) === (b.fixedPence ?? 0) &&
      a.capPence === b.capPence &&
      (a.offerOrdersPerMonth ?? 0) === (b.offerOrdersPerMonth ?? 0) &&
      (a.offerMonths ?? 0) === (b.offerMonths ?? 0),
  );
}

/** "10p" under a pound, "£1.00" from a pound. */
function money(pence: number): string {
  return pence < 100 ? `${pence}p` : `£${(pence / 100).toFixed(2)}`;
}

/** "0.5% + 10p", or "3%" with no fixed amount. */
export function feeText(deal: Deal): string {
  const fixed = deal.fixedPence ?? 0;
  return fixed > 0 ? `${percentText(deal.percentBp)}% + ${money(fixed)}` : `${percentText(deal.percentBp)}%`;
}

/**
 * The deal in plain words, from the copy given (English or Chinese). `offerEnds`:
 * the end of the launch offer as a date to show, when known.
 */
export function dealSentences(deal: Deal, copy: (key: DealCopy) => string, offerEnds: string | null): string {
  const parts: string[] = [];
  const offer = (deal.offerOrdersPerMonth ?? 0) > 0 && (deal.offerMonths ?? 0) > 0;
  if (deal.freeCardOrders > 0) parts.push(copy("dealFirstFree").replace("{free}", String(deal.freeCardOrders)));
  if (offer) {
    parts.push(
      (offerEnds ? copy("dealOfferUntil").replace("{date}", offerEnds) : copy("dealOfferMonths").replace("{months}", String(deal.offerMonths)))
        .replace("{offer}", String(deal.offerOrdersPerMonth)),
    );
  }
  const fee = parts.length === 0 ? "dealFee" : offer ? "dealFeeOtherwise" : "dealFeeAfter";
  parts.push(copy(fee).replace("{fee}", feeText(deal)).replace("{cap}", `£${(deal.capPence / 100).toFixed(2)}`));
  return parts.join(" ");
}

export type DealCopy = "dealFirstFree" | "dealOfferUntil" | "dealOfferMonths" | "dealFee" | "dealFeeAfter" | "dealFeeOtherwise";

const DEAL = "freeCardOrders percentBp fixedPence capPence offerOrdersPerMonth offerMonths";
const PAYMENTS = `available connected cardPayments accountReady payoutsEnabled deal { ${DEAL} } cardOrdersPaid terms { version text } agreement { termsVersion deal { ${DEAL} } ownerName ownerEmail acceptedAt } needsAcceptance offer { ordersPerMonth endsAt monthUsed monthEndsAt }`;

/** One owner call to the cloud's one address (DAN-43): GraphQL, signed in. */
function ask<T>(cloudUrl: string, token: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  return graphql<T>(cloudUrl, query, variables, { token });
}

/** The owner accepts the terms and deal they were shown. */
export async function acceptTerms(cloudUrl: string, token: string, termsVersion: string, deal: Deal, name: string): Promise<PaymentsStatus> {
  const input = {
    freeCardOrders: deal.freeCardOrders,
    percentBp: deal.percentBp,
    fixedPence: deal.fixedPence ?? 0,
    capPence: deal.capPence,
    offerOrdersPerMonth: deal.offerOrdersPerMonth ?? 0,
    offerMonths: deal.offerMonths ?? 0,
  };
  const data = await ask<{ acceptTerms: PaymentsStatus }>(
    cloudUrl,
    token,
    `mutation($termsVersion: String!, $deal: DealInput!, $name: String!) { acceptTerms(termsVersion: $termsVersion, deal: $deal, name: $name) { ${PAYMENTS} } }`,
    { termsVersion, deal: input, name },
  );
  return data.acceptTerms;
}

export async function getPayments(cloudUrl: string, token: string): Promise<PaymentsStatus> {
  return (await ask<{ payments: PaymentsStatus }>(cloudUrl, token, `query { payments { ${PAYMENTS} } }`)).payments;
}

/** A page of Stripe's, which only ever starts https://. */
function stripeLink(url: string | null | undefined): string {
  if (!url || !/^https:\/\//.test(url)) throw new DanError("unreachable", "Stripe's link was not as expected.");
  return url;
}

/** Stripe's onboarding page for the shop; Stripe sends the owner back to `returnTo`. */
export async function connectPayments(cloudUrl: string, token: string, returnTo: string): Promise<string> {
  const data = await ask<{ connectStripe: string }>(cloudUrl, token, "mutation($returnTo: String!) { connectStripe(returnTo: $returnTo) }", { returnTo });
  return stripeLink(data.connectStripe);
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

const SHOP_SERVER = "available prices { setupPence setupWasPence monthlyPence } state on withoutPayment ownMachine periodEnd endsAt endedAt termsAccepted";

export async function getShopServer(cloudUrl: string, token: string): Promise<ShopServerStatus> {
  return (await ask<{ shopServer: ShopServerStatus }>(cloudUrl, token, `query { shopServer { ${SHOP_SERVER} } }`)).shopServer;
}

/** Stripe Checkout for the setup and the first month; Stripe sends the owner back to `returnTo`. */
export async function buyShopServer(cloudUrl: string, token: string, returnTo: string): Promise<string> {
  const data = await ask<{ buyShopServer: string }>(cloudUrl, token, "mutation($returnTo: String!) { buyShopServer(returnTo: $returnTo) }", { returnTo });
  return stripeLink(data.buyShopServer);
}

/** Stripe's own billing page: the card, cancelling. */
export async function manageShopServer(cloudUrl: string, token: string, returnTo: string): Promise<string> {
  const data = await ask<{ manageBilling: string }>(cloudUrl, token, "mutation($returnTo: String!) { manageBilling(returnTo: $returnTo) }", { returnTo });
  return stripeLink(data.manageBilling);
}
