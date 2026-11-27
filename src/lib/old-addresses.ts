/**
 * Pages that moved into Settings (DAN-33), and where each one went. The old
 * addresses forward for good, so bookmarks, a tablet's home screen and a
 * Stripe link made before the move keep working. Read by next.config.ts.
 */
export const MOVED_PAGES: { from: string; to: string }[] = [
  { from: "/shop/ordering", to: "/shop/settings/ordering" },
  { from: "/shop/board", to: "/shop/settings/flow" },
  // Stripe sent owners back here after connecting; the connection now lives under Integrations.
  { from: "/shop/payments", to: "/shop/settings/integrations/stripe" },
  { from: "/shop/tools", to: "/shop/settings/tables" },
];
