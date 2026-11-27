import { DanError } from "./errors";
import { graphql } from "./graphql-client";
import type { Shop, Staff } from "./types";

/**
 * The Dan cloud's one address (RK, 27 Nov 2026, DAN-42, DAN-43): joining,
 * signing in, and from then on the shop itself, owner and staff alike, at
 * `https://cloud.dan.partners/graphql`. A sign-in's token says which shop.
 *
 * Set NEXT_PUBLIC_DAN_CLOUD_URL at build time for a cloud somewhere else
 * (local work, a test stack).
 */
export const CLOUD_URL = (process.env.NEXT_PUBLIC_DAN_CLOUD_URL || "https://cloud.dan.partners").replace(/\/+$/, "");

/** How long the cloud gets to answer an account request. */
const TIMEOUT_MS = 15_000;

/** A sign-in at the cloud: its token (for this shop only), who, which shop, and where. */
export type CloudSession = {
  token: string;
  staff: Staff;
  shop: Shop;
  /** The cloud's one address: the dashboard's server from now on. */
  cloudUrl: string;
  /** goldendragon in goldendragon.dan.partners. */
  addressName: string;
  /** The shop's own address: its ordering site, dish photos and Uber's notices. */
  shopAddress: string;
};

export type ShopTemplate = "online_shop" | "restaurant";

export type JoinInput = {
  invite: string;
  ownerName: string;
  password: string;
  shopName: string;
  addressName: string;
  template: ShopTemplate;
};

type Options = { fetchImpl?: typeof fetch; base?: string };

/** One GraphQL call to the cloud's one address, with no sign-in. */
async function ask<T>(query: string, variables: Record<string, unknown>, options: Options = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await graphql<T>(options.base ?? CLOUD_URL, query, variables, { fetchImpl: options.fetchImpl, signal: controller.signal });
  } catch (error) {
    if (error instanceof DanError && ["unreachable", "timeout"].includes(error.code)) {
      throw new DanError("cloud_unreachable", "The Dan cloud did not answer. Check the internet connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const SESSION = "token shopAddress staff { id name role } shop { id name nameZh address city phone addressName }";

type SessionAnswer = {
  token?: string;
  shopAddress?: string;
  staff?: Staff;
  shop?: Shop & { addressName?: string | null };
};

function session(value: SessionAnswer | null | undefined, options: Options = {}): CloudSession {
  if (!value?.token || !value.shop?.name || !value.staff?.role) {
    throw new DanError("bad_response", "The Dan cloud gave an answer this page could not read.");
  }
  const { addressName, ...shop } = value.shop;
  return {
    token: value.token,
    staff: value.staff,
    shop,
    cloudUrl: (options.base ?? CLOUD_URL).replace(/\/+$/, ""),
    addressName: addressName ?? "",
    shopAddress: value.shopAddress ?? "",
  };
}

/** Leaves an email on the waiting list. The answer is the same whoever asks. */
export async function joinWaitlist(email: string, options?: Options): Promise<void> {
  await ask<{ joinWaitlist: boolean }>("mutation($email: String!) { joinWaitlist(email: $email) }", { email }, options);
}

/** Whose invite this is, if it can still be used. */
export async function getInvite(token: string, options?: Options): Promise<{ email: string }> {
  return (await ask<{ invitation: { email: string } }>("query($token: String!) { invitation(token: $token) { email } }", { token }, options)).invitation;
}

/** Whether an address name is free, and the address it would give. */
export async function checkAddress(name: string, options?: Options): Promise<{ available: boolean; address: string }> {
  return (await ask<{ addressFree: { available: boolean; address: string } }>("query($name: String!) { addressFree(name: $name) { available address } }", { name }, options))
    .addressFree;
}

/** Uses an invite: makes the shop and signs in. */
export async function joinShop(input: JoinInput, options?: Options): Promise<CloudSession> {
  const data = await ask<{ join: SessionAnswer }>(`mutation($input: JoinInput!) { join(input: $input) { ${SESSION} } }`, { input }, options);
  return session(data.join, options);
}

/**
 * Email and password: finds the owner's shop and signs in. `shop`, its
 * address name, when known (a tablet on the shop's machine): that shop.
 */
export async function cloudLogin(email: string, password: string, options?: Options & { shop?: string | null }): Promise<CloudSession> {
  const data = await ask<{ signIn: SessionAnswer }>(
    `mutation($email: String!, $password: String!, $shop: String) { signIn(email: $email, password: $password, shop: $shop) { ${SESSION} } }`,
    { email, password, shop: options?.shop ?? null },
    options,
  );
  return session(data.signIn, options);
}

/** The shop's address name, then a staff member's name and PIN (DAN-44). */
export async function cloudPinLogin(addressName: string, name: string, pin: string, options?: Options): Promise<CloudSession> {
  const data = await ask<{ signInStaff: SessionAnswer }>(
    `mutation($shop: String!, $name: String!, $pin: String!) { signInStaff(shop: $shop, name: $name, pin: $pin) { ${SESSION} } }`,
    { shop: addressName.trim().toLowerCase(), name: name.trim(), pin },
    options,
  );
  return session(data.signInStaff, options);
}

/** Whose password a reset link is for, if it can still be used. */
export async function getReset(token: string, options?: Options): Promise<{ email: string }> {
  return (await ask<{ passwordReset: { email: string } }>("query($token: String!) { passwordReset(token: $token) { email } }", { token }, options)).passwordReset;
}

/** Sets a new password from a reset link and signs in. */
export async function resetPassword(token: string, password: string, options?: Options): Promise<CloudSession> {
  const data = await ask<{ resetPassword: SessionAnswer }>(`mutation($token: String!, $password: String!) { resetPassword(token: $token, password: $password) { ${SESSION} } }`, { token, password }, options);
  return session(data.resetPassword, options);
}

/** An address name from a shop's name: lowercase letters, digits and hyphens. */
export function addressNameFrom(shopName: string): string {
  return shopName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** The token a join or reset link carries after its #. */
export function linkToken(hash: string): string | null {
  const token = hash.replace(/^#/, "").trim();
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}
