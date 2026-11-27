import { expect, type Page } from "@playwright/test";

type Section = "shop" | "ordering" | "flow" | "tables" | "integrations" | "subscription";

/**
 * Opens one section of Settings the way staff do: Settings in the menu, then
 * the section (and, under Integrations, one integration). Pages visited
 * before stay in the page, hidden, so only what is visible counts.
 */
export async function openSettings(page: Page, section: Section, integration?: "stripe" | "uber") {
  await page.getByRole("link", { name: /^Settings/ }).first().click();
  await expect(page.getByTestId("settings-index").filter({ visible: true })).toBeVisible();
  await page.locator(`[data-testid="settings-section"][data-section="${section}"]`).filter({ visible: true }).click();
  await expect(page.locator(`[data-testid="settings-page"][data-section="${section}"]`).filter({ visible: true })).toBeVisible();
  if (integration) {
    await page.locator(`[data-testid="integration"][data-integration="${integration}"]`).filter({ visible: true }).click();
    await expect(page).toHaveURL(new RegExp(`/shop/settings/integrations/${integration}$`));
  }
}

/**
 * The counter PIN's Settings: Tables & printers only (RK, 27 Nov 2026). Any
 * other section, opened by its address, says it is the owner's.
 */
export async function expectPinCannotSee(page: Page, section: Exclude<Section, "tables">) {
  await page.getByRole("link", { name: /^Settings/ }).first().click();
  const index = page.getByTestId("settings-index").filter({ visible: true });
  await expect(index.getByTestId("settings-section")).toHaveCount(1);
  await expect(index.locator('[data-section="tables"]')).toBeVisible();
  await page.goto(`/shop/settings/${section}`);
  await expect(page.getByTestId("settings-owner-only").filter({ visible: true })).toBeVisible();
}
