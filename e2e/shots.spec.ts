import { expect, test } from "@playwright/test";

const out = "docs/screenshots";

test("capture the connect screen and the counter", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.screenshot({ path: `${out}/connect.png` });

  await page.getByLabel("Server URL").fill("http://127.0.0.1:9");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText(/No Dan server answered/i)).toBeVisible();
  await page.screenshot({ path: `${out}/connect-error.png` });

  await page.getByTestId("demo-button").click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await page.screenshot({ path: `${out}/orders.png` });

  await page.getByRole("link", { name: /^Till/ }).click();
  await page.getByRole("button", { name: "4", exact: true }).click();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "8", exact: true }).click();
  await page.getByRole("button", { name: "0", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Crispy chilli beef").first()).toBeVisible();
  await page.screenshot({ path: `${out}/till.png` });
  await page.getByRole("button", { name: "Send to kitchen" }).click();
  await page.getByRole("link", { name: "View ticket" }).click();
  await expect(page.getByTestId("ticket-slip")).toContainText("GOLDEN DRAGON");
  await page.screenshot({ path: `${out}/ticket.png` });

  await page.getByRole("link", { name: /^Menu/ }).click();
  await expect(page.getByRole("heading", { name: "Menu" })).toBeVisible();
  await page.getByRole("button", { name: /Chicken/ }).click();
  await expect(page.getByText("Kung po chicken")).toBeVisible();
  await page.screenshot({ path: `${out}/menu.png` });

  await page.getByRole("link", { name: /^Stamps/ }).click();
  await expect(page.getByRole("heading", { name: "Stamp cards" })).toBeVisible();
  await page.getByRole("button", { name: /Mrs Wong/ }).click();
  await expect(page.getByRole("button", { name: "Add a stamp" })).toBeVisible();
  await page.screenshot({ path: `${out}/stamps.png` });

  await page.getByRole("link", { name: /^Sales/ }).click();
  await expect(page.getByText("Takings")).toBeVisible();
  await page.screenshot({ path: `${out}/sales.png` });

  await page.getByRole("link", { name: /^Orders/ }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await page.getByTestId("theme-button").first().click();
  await expect(page.getByRole("heading", { name: "Theme" })).toBeVisible();
  await page.screenshot({ path: `${out}/themes.png` });
  await page.getByRole("button", { name: "Customise" }).click();
  await expect(page.getByRole("heading", { name: "Customise theme" })).toBeVisible();
  await page.screenshot({ path: `${out}/theme-customise.png` });
  await page.getByRole("button", { name: "Back to themes" }).click();
  await page.getByTestId("theme-seal").click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.screenshot({ path: `${out}/orders-seal.png` });
  await page.getByTestId("theme-button").first().click();
  await page.getByTestId("theme-ink").click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.screenshot({ path: `${out}/orders-ink.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.screenshot({ path: `${out}/connect-phone.png` });
  await page.getByTestId("demo-button").click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await page.screenshot({ path: `${out}/orders-phone.png` });
});
