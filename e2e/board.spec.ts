import { expect, test } from "@playwright/test";

/** The owner's board columns, in the demo (kept in this browser, like the theme). */
test("the owner adds a column, tickets move through it, and removing it moves them left after a yes", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/shop/orders?demo=1");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.locator("section[data-column]")).toHaveCount(4);

  await page.goto("/shop/board");
  await page.getByRole("button", { name: "Add a column" }).click();
  await page.getByLabel("English name 3").fill("Packing");
  await page.getByLabel("Chinese name 3").fill("包裝");
  await page.getByLabel("English name 1").fill("Incoming");
  // A colour too pale for the theme is shown stronger, and the owner is told.
  await page.getByLabel("Colour 3").fill("#fdf6e3");
  await expect(page.getByTestId("board-strengthened-2")).toContainText("stronger on screen");
  await page.getByLabel("Colour 3").fill("#7a4fd0");
  await expect(page.getByTestId("board-strengthened-2")).toHaveCount(0);
  await page.getByRole("button", { name: "Save board" }).click();
  await expect(page.getByTestId("board-message")).toHaveText("Board saved. Every tablet follows.");

  // Renamed and added, kept after a reload; the kitchen and pass follow roles.
  await page.goto("/shop/orders");
  const headings = page.locator("section[data-column] h2");
  await expect(headings).toHaveText([/^Incoming/, /^Preparing/, /^Packing/, /^Ready/, /^Completed/]);
  const preparing = page.locator("section[data-column='preparing'] article").first();
  const number = (await preparing.getByTestId("docket-number").textContent())!;
  await preparing.getByRole("button", { name: "Move to Packing" }).click();
  const packing = page.locator("section[data-column]").nth(2);
  await expect(packing.locator("article", { hasText: number })).toBeVisible();
  await page.reload();
  await expect(page.locator("section[data-column]").nth(2).locator("article", { hasText: number })).toBeVisible();
  // Sent back within the same stage, then on again.
  await page.locator("section[data-column]").nth(2).locator("article", { hasText: number }).getByRole("button", { name: "Send back to Preparing" }).click();
  await expect(page.locator("section[data-column='preparing'] article", { hasText: number })).toBeVisible();
  await expect(page.locator("section[data-column='preparing'] article", { hasText: number }).getByRole("button", { name: /Send back/ })).toHaveCount(0);
  // The board ignores a second tap within 0.7 s, so a double tap never moves twice.
  await page.waitForTimeout(800);
  await page.locator("section[data-column='preparing'] article", { hasText: number }).getByRole("button", { name: "Move to Packing" }).click();
  await expect(page.locator("section[data-column]").nth(2).locator("article", { hasText: number })).toBeVisible();
  await page.goto("/shop/kitchen");
  await expect(page.getByTestId("kitchen-ticket").filter({ hasText: number })).toHaveAttribute("aria-label", /Packing/);

  // Removing Packing with a ticket in it: the owner is told, then the ticket moves left.
  await page.goto("/shop/board");
  await page.getByRole("button", { name: "Remove column 3" }).click();
  await page.getByRole("button", { name: "Save board" }).click();
  await expect(page.getByTestId("board-moves")).toContainText("1 tickets: Packing → Preparing");
  await page.getByRole("button", { name: "Save and move them" }).click();
  await expect(page.getByTestId("board-message")).toHaveText("Board saved. Every tablet follows.");
  await page.goto("/shop/orders");
  await expect(page.locator("section[data-column='preparing'] article", { hasText: number })).toBeVisible();

  // Reset asks for a second tap, then brings back the four columns.
  await page.goto("/shop/board");
  await page.getByTestId("board-reset").click();
  await expect(page.getByTestId("board-reset")).toHaveText("Tap again to confirm");
  await page.getByTestId("board-reset").click();
  await expect(page.getByTestId("board-message")).toContainText("back to New, Preparing, Ready, Completed");
  await page.goto("/shop/orders");
  await expect(page.locator("section[data-column] h2")).toHaveText([/^New/, /^Preparing/, /^Ready/, /^Completed/]);
});
