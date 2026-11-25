import { DanError } from "./errors";

/**
 * The Dan cloud's address. Always https, except this machine for testing
 * (`localhost`, a name under it such as `goldendragon.localhost`, or 127.0.0.1).
 * Empty means no cloud.
 */
export function normalizeCloudUrl(input: string): string | null {
  if (!input.trim()) return null;
  const url = normalizeServerUrl(/^[a-z][a-z0-9+.-]*:\/\//i.test(input.trim()) ? input : `https://${input.trim()}`);
  const local = /^http:\/\/(([a-z0-9-]+\.)*localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
  if (!url.startsWith("https://") && !local) {
    throw new DanError("invalid_url", "The Dan cloud's address starts with https://");
  }
  return url;
}

/**
 * Accepts a shop address the way someone would say it at the counter:
 * `192.168.1.20:2283` or `https://goldendragon.dan.partners/`.
 * Returns an origin plus optional base path, with no trailing slash.
 */
export function normalizeServerUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new DanError("invalid_url", "Enter a server address.");
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new DanError("invalid_url", "That does not look like a server address.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DanError("invalid_url", "Use an http or https address.");
  }
  if (url.username || url.password) {
    throw new DanError("invalid_url", "Leave the username and password out of the server address.");
  }
  if (!url.hostname || url.hostname.includes(" ")) {
    throw new DanError("invalid_url", "That does not look like a server address.");
  }

  const path = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${path === "/" ? "" : path}`;
}
