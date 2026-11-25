import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";

/**
 * The counter moves to the Dan cloud when the shop server stops, and back when
 * it returns, with the orders taken meanwhile.
 *
 * Opt in with a shop server syncing to a cloud (both with the Golden Dragon
 * menu, the cloud allowing http://localhost:3000), and commands that stop and
 * start that shop server:
 *
 *   DAN_E2E_SERVER_URL=http://127.0.0.1:2283 \
 *   DAN_E2E_CLOUD_URL=http://goldendragon.localhost:2290/staff DAN_E2E_PIN=… \
 *   DAN_E2E_SHOP_STOP='…' DAN_E2E_SHOP_START='…' npx playwright test switch-over
 *
 * It stops the shop server, so never point it at a shop in service.
 */
const server = process.env.DAN_E2E_SERVER_URL;
const cloud = process.env.DAN_E2E_CLOUD_URL;
const pin = process.env.DAN_E2E_PIN ?? "";
const stopShop = process.env.DAN_E2E_SHOP_STOP;
const startShop = process.env.DAN_E2E_SHOP_START;

test.skip(!server || !cloud || !stopShop || !startShop, "Set DAN_E2E_SERVER_URL, DAN_E2E_CLOUD_URL and the shop stop/start commands to run this.");

test.afterAll(() => {
  // Leave the shop server running whatever happened.
  execSync(startShop!, { stdio: "inherit" });
});

test("the counter carries on through the cloud while the shop server is down, then goes back", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.getByLabel("Shop server").fill(server!);
  await page.getByLabel("Dan cloud (optional)").fill(cloud!);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "PIN", exact: true }).click();
  await page.getByLabel("PIN").fill(pin);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();

  const status = page.getByTestId("connection-status");
  await expect(status).toHaveAttribute("data-shop", "connected");
  await expect(status).toHaveAttribute("data-cloud", "connected");
  await expect(status).toHaveAttribute("data-in-use", "shop");

  execSync(stopShop!, { stdio: "inherit" });

  // Three missed checks, then the cloud.
  await expect(status).toHaveAttribute("data-in-use", "cloud", { timeout: 30_000 });
  await expect(status).toHaveAttribute("data-shop", "offline");
  await expect(page.getByTestId("server-switch")).toContainText("using the Dan cloud");
  await expect(page.getByRole("alert").filter({ hasText: "stopped answering" })).toHaveCount(0);

  // An order taken at the till goes to the cloud.
  await page.getByRole("link", { name: /^Till/ }).click();
  for (const key of ["2", "×", "8", "1"]) {
    await page.getByRole("button", { name: key === "×" ? "Times" : key, exact: true }).click();
  }
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Send to kitchen" }).click();
  await expect(page.getByText(/Sent to the kitchen/)).toBeVisible();

  // With the shop server away, the cloud numbers it from 9001.
  await page.getByRole("link", { name: /^Orders/ }).click();
  await expect(page.getByText(/#9\d{3}/).first()).toBeVisible({ timeout: 45_000 });
  const number = (await page.getByText(/#9\d{3}/).first().textContent())!.match(/#(9\d{3})/)![1];

  execSync(startShop!, { stdio: "inherit" });

  // Two good checks and caught up: back to the shop server, with the order on it.
  await expect(status).toHaveAttribute("data-in-use", "shop", { timeout: 60_000 });
  await expect(page.getByTestId("server-switch")).toHaveAttribute("data-server", "shop");
  // The board was just fetched again from the shop server, so this is the shop's copy.
  await expect(page.getByText(`#${number}`).first()).toBeVisible();
});
