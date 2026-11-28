import { DanError } from "./errors";
import type { Session } from "./types";

/** A sheet is for a shop's tables, not a stadium. */
export const MAX_TABLES = 200;
/** What a table may be called (letters and digits; a hyphen means a range). */
const LABEL = /^[A-Za-z0-9]{1,8}$/;

/**
 * Reads tables the way an owner writes them: "1-12, 20, A1". Ranges are
 * numbers only. Order is kept, repeats are dropped.
 */
export function parseTables(input: string): string[] {
  const out: string[] = [];
  const add = (label: string) => {
    if (!out.includes(label)) out.push(label);
    if (out.length > MAX_TABLES) throw new DanError("invalid", `Up to ${MAX_TABLES} tables at a time.`);
  };
  for (const part of input.split(/[,\s]+/).filter(Boolean)) {
    const range = /^(\d{1,4})-(\d{1,4})$/.exec(part);
    if (range) {
      const [from, to] = [Number(range[1]), Number(range[2])];
      if (to < from) throw new DanError("invalid", `"${part}" runs backwards.`);
      if (to - from >= MAX_TABLES) throw new DanError("invalid", `Up to ${MAX_TABLES} tables at a time.`);
      for (let n = from; n <= to; n++) add(String(n));
    } else if (LABEL.test(part)) {
      add(part);
    } else {
      throw new DanError("invalid", `"${part}" is not a table. Use numbers, ranges like 1-12, or short names like A1.`);
    }
  }
  return out;
}

/**
 * The shop's ordering site (https://<shop>.dan.partners), for its table QR
 * codes, as the cloud's sign-in says it (DAN-43). Photos and Uber's notices
 * are on the cloud's one address (photos.ts, uber.ts).
 */
export function shopAddressOf(session: Pick<Session, "shopAddress"> | null | undefined): string {
  return session?.shopAddress ? session.shopAddress.replace(/\/+$/, "") : "";
}

/** An ordering site address as typed: https (or this machine for testing), the address alone. */
export function normalizeOrderingAddress(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new DanError("invalid_url", "Enter the shop's ordering address.");
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    throw new DanError("invalid_url", "That does not look like a web address.");
  }
  const local = url.protocol === "http:" && /^(([a-z0-9-]+\.)*localhost|127\.0\.0\.1)$/i.test(url.hostname);
  if (url.protocol !== "https:" && !local) throw new DanError("invalid_url", "The ordering address starts with https://");
  if (url.username || url.password) throw new DanError("invalid_url", "Leave any username and password out of the address.");
  return url.origin;
}

/** What a table's QR code opens. */
export function tableLink(address: string, table: string): string {
  return `${address}/?table=${encodeURIComponent(table)}`;
}
