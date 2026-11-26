import { DanError } from "./errors";
import type { Shop, Staff } from "./types";

/**
 * The Dan cloud's own address: where a business joins and where an owner
 * signs in with an email. Each shop's staff API is at its own address, which
 * the cloud hands back on sign-in.
 *
 * Set NEXT_PUBLIC_DAN_CLOUD_URL at build time for a cloud somewhere else
 * (local work, a test stack).
 */
export const CLOUD_URL = (process.env.NEXT_PUBLIC_DAN_CLOUD_URL || "https://cloud.dan.partners").replace(/\/+$/, "");

/** How long the cloud gets to answer an account request. */
const TIMEOUT_MS = 15_000;

/** A sign-in from the cloud: the shop's own session, and where its staff API is. */
export type CloudSession = {
  token: string;
  staff: Staff;
  shop: Shop;
  /** The shop's staff API: the dashboard's server from now on. */
  staffUrl: string;
  /** goldendragon in goldendragon.dan.partners. */
  addressName: string;
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

async function call<T>(path: string, init: RequestInit, options: Options = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${options.base ?? CLOUD_URL}${path}`, {
      ...init,
      headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}) },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    throw new DanError("cloud_unreachable", "The Dan cloud did not answer. Check the internet connection and try again.");
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new DanError(error?.code ?? "bad_response", error?.message ?? "The Dan cloud could not do that. Try again.");
  }
  if (body === null) throw new DanError("bad_response", "The Dan cloud gave an answer this page could not read.");
  return body as T;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

function session(value: CloudSession): CloudSession {
  if (!value?.token || !value.staffUrl || !value.shop?.name || !value.staff?.role) {
    throw new DanError("bad_response", "The Dan cloud gave an answer this page could not read.");
  }
  return value;
}

/** Leaves an email on the waiting list. The answer is the same whoever asks. */
export async function joinWaitlist(email: string, options?: Options): Promise<void> {
  await call<{ ok: boolean }>("/v1/waitlist", post({ email }), options);
}

/** Whose invite this is, if it can still be used. */
export function getInvite(token: string, options?: Options): Promise<{ email: string }> {
  return call<{ email: string }>(`/v1/invites/${encodeURIComponent(token)}`, { method: "GET" }, options);
}

/** Whether an address name is free, and the address it would give. */
export function checkAddress(name: string, options?: Options): Promise<{ available: boolean; address: string }> {
  return call<{ available: boolean; address: string }>(`/v1/address/${encodeURIComponent(name)}`, { method: "GET" }, options);
}

/** Uses an invite: makes the shop and signs in. */
export async function joinShop(input: JoinInput, options?: Options): Promise<CloudSession> {
  return session(await call<CloudSession>("/v1/join", post(input), options));
}

/** Email and password: finds the owner's shop and signs in. */
export async function cloudLogin(email: string, password: string, options?: Options): Promise<CloudSession> {
  return session(await call<CloudSession>("/v1/login", post({ email, password }), options));
}

/** Where a shop's staff API is, from its address name (for the counter PIN). */
export function findShop(name: string, options?: Options): Promise<{ name: string; addressName: string; staffUrl: string }> {
  return call<{ name: string; addressName: string; staffUrl: string }>(
    `/v1/shops/${encodeURIComponent(name.trim().toLowerCase())}`,
    { method: "GET" },
    options,
  );
}

/** Whose password a reset link is for, if it can still be used. */
export function getReset(token: string, options?: Options): Promise<{ email: string }> {
  return call<{ email: string }>(`/v1/resets/${encodeURIComponent(token)}`, { method: "GET" }, options);
}

/** Sets a new password from a reset link and signs in. */
export async function resetPassword(token: string, password: string, options?: Options): Promise<CloudSession> {
  return session(await call<CloudSession>("/v1/reset", post({ token, password }), options));
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
