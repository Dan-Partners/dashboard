import type { CopyKey } from "./i18n";

/**
 * Settings: every setting of the shop in one place, one page per section
 * (RK, 27 Nov 2026, DAN-33). Order of the list is the owner's order of need:
 * who the shop is, how it takes orders, how orders flow, the hardware, the
 * outside services, and what the shop has agreed with Dan.
 */
export type SettingsSection = "shop" | "staff" | "ordering" | "flow" | "tables" | "integrations" | "subscription";

export const SETTINGS_ROUTE = "/shop/settings";
export const settingsRoute = (section: SettingsSection) => `${SETTINGS_ROUTE}/${section}`;

export const SETTINGS_SECTIONS: { id: SettingsSection; label: CopyKey; gloss: CopyKey; hint: CopyKey }[] = [
  { id: "shop", label: "settingsShop", gloss: "settingsShopZh", hint: "settingsShopHint" },
  // Named staff and the activity log (RK, 27 Nov 2026, DAN-44): the owner's only.
  { id: "staff", label: "settingsStaff", gloss: "settingsStaffZh", hint: "settingsStaffHint" },
  { id: "ordering", label: "settingsOrdering", gloss: "settingsOrderingZh", hint: "settingsOrderingHint" },
  { id: "flow", label: "settingsFlow", gloss: "settingsFlowZh", hint: "settingsFlowHint" },
  { id: "tables", label: "settingsTables", gloss: "settingsTablesZh", hint: "settingsTablesHint" },
  { id: "integrations", label: "settingsIntegrations", gloss: "settingsIntegrationsZh", hint: "settingsIntegrationsHint" },
  { id: "subscription", label: "settingsSubscription", gloss: "settingsSubscriptionZh", hint: "settingsSubscriptionHint" },
];

/**
 * What the counter PIN sees: Tables & printers only, where it prints table
 * cards and test tickets (RK, 27 Nov 2026). The rest is the owner's. This is
 * what the dashboard shows; the server still refuses every owner-only change
 * from the PIN whatever the page.
 */
export function sectionsFor(owner: boolean): SettingsSection[] {
  return owner ? SETTINGS_SECTIONS.map((section) => section.id) : ["tables"];
}

export type IntegrationState = "connected" | "attention" | "not_connected" | "needs_cloud" | "checking";

/**
 * How the Stripe integration stands, from the cloud's payments status. It
 * needs attention when the account is started but cannot take charges, or
 * when Stripe holds its payouts.
 */
export function stripeState(status: { available: boolean; connected: boolean; accountReady?: boolean; payoutsEnabled?: boolean } | null, cloud: boolean): IntegrationState {
  if (!cloud) return "needs_cloud";
  if (!status) return "checking";
  if (!status.connected) return "not_connected";
  if (!status.accountReady) return "attention";
  // An older cloud does not say: no news is not a hold.
  if (status.payoutsEnabled === false) return "attention";
  return "connected";
}
