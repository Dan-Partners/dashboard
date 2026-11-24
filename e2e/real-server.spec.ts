import { expect, test, type Page } from "@playwright/test";

/**
 * Runs the dashboard against a real Dan shop server, not the demo.
 *
 * Opt in by pointing it at a server set up with the Golden Dragon menu
 * (`dan-server init --demo`) whose DAN_ALLOWED_ORIGINS includes
 * http://localhost:3000:
 *
 *   DAN_E2E_SERVER_URL=http://127.0.0.1:2283 DAN_E2E_OWNER_EMAIL=… \
 *   DAN_E2E_OWNER_PASSWORD=… DAN_E2E_PIN=… npx playwright test real-server
 *
 * It changes data on that server (an order, a sold-out flag, a price), so
 * never point it at a shop in service.
 */
const server = process.env.DAN_E2E_SERVER_URL;
const ownerEmail = process.env.DAN_E2E_OWNER_EMAIL ?? "";
const ownerPassword = process.env.DAN_E2E_OWNER_PASSWORD ?? "";
const pin = process.env.DAN_E2E_PIN ?? "";

test.skip(!server, "Set DAN_E2E_SERVER_URL to run against a real shop server.");

async function connect(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.getByLabel("Server URL").fill(server!);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Golden Dragon" })).toBeVisible();
}

test("the counter PIN runs service but cannot see sales or edit dishes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await connect(page);
  await page.getByRole("button", { name: "PIN", exact: true }).click();

  await page.getByLabel("PIN").fill("0000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("connect-error")).toContainText("not recognised");

  await page.getByLabel("PIN").fill(pin);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.getByTestId("signed-in-as")).toContainText("Counter");
  await expect(page.getByRole("link", { name: /^Sales/ })).toHaveCount(0);

  await page.getByRole("link", { name: /^Menu/ }).click();
  await expect(page.getByTestId("menu-counter-note")).toBeVisible();
  await page.getByRole("button", { name: /Rice/ }).first().click();
  const dish = page.getByRole("button", { name: /Egg fried rice/ }).first();
  await expect(dish).toBeDisabled();
  const toggle = page.getByRole("switch", { name: "81 Egg fried rice" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  await page.getByRole("link", { name: /^Till/ }).click();
  for (const key of ["2", "×", "8", "1"]) {
    await page.getByRole("button", { name: key === "×" ? "Times" : key, exact: true }).click();
  }
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Egg fried rice").first()).toBeVisible();
  await page.getByRole("button", { name: "Send to kitchen" }).click();
  await expect(page.getByText(/Sent to the kitchen/)).toBeVisible();
  await page.getByRole("link", { name: "View ticket" }).click();
  const slip = page.getByTestId("ticket-slip");
  await expect(slip).toContainText("GOLDEN DRAGON");
  await expect(slip).toContainText("蛋炒飯");

  await page.goto("/shop/sales");
  await expect(page.getByTestId("sales-owner-only")).toBeVisible();
});

test("the owner sees sales and edits a dish", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await connect(page);
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.getByTestId("signed-in-as")).toContainText("Owner");

  await page.getByRole("link", { name: /^Sales/ }).click();
  await expect(page.getByText("Takings")).toBeVisible();

  await page.getByRole("link", { name: /^Menu/ }).click();
  await expect(page.getByTestId("menu-counter-note")).toHaveCount(0);
  await page.getByRole("button", { name: /Rice/ }).first().click();
  await page.getByRole("button", { name: /Boiled rice/ }).first().click();
  const price = page.getByLabel("Price");
  await price.fill("3.20");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Boiled rice/ }).first()).toContainText("£3.20");
});
