/**
 * Features that can be switched off for every shop while they wait for later.
 * Switching one off only hides it in the dashboard: its data and the shop
 * server's operations stay, so switching it back on loses nothing.
 */
export const FEATURES = {
  /** Phone-number stamp cards. Off since 25 Nov 2026, until the cloud sync is in place. */
  stamps: false,
} as const;
