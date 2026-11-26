import { expect, type Page } from "@playwright/test";

/**
 * Opens Create order with the till's keypad, as staff do: Orders, Create
 * order, then Till. (A device with nothing remembered starts on the menu.)
 */
export async function openTill(page: Page) {
  await page.getByRole("link", { name: /^Orders/ }).first().click();
  await page.getByTestId("create-order").filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Create order" })).toBeVisible();
  await page.getByTestId("create-mode-till").filter({ visible: true }).click();
  await expect(page.getByTestId("till-keypad").filter({ visible: true })).toBeVisible();
}
