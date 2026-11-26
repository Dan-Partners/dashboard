import { execFileSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";

/*
 * Joining Dan in the cloud, for tests that need a brand new shop. They need a
 * running Dan cloud and its command, as e2e/accounts.spec.ts describes.
 */
const cloudBin = process.env.DAN_E2E_CLOUD_BIN;
export const cloudOn = Boolean(process.env.DAN_E2E_ACCOUNTS && process.env.DAN_E2E_CLOUD && cloudBin);
export const cloudSkip = "Needs a running Dan cloud and its command; see e2e/accounts.spec.ts.";

/**
 * Invites a new address with the cloud's command (as Dan does by hand), then
 * joins with the link, choosing the kind of shop. Ends on the new shop's
 * empty menu.
 */
export async function joinNewShop(page: Page, kind: "Online shop" | "Restaurant", label: string) {
  const stamp = Date.now().toString(36);
  const invite = execFileSync(cloudBin!, ["waitlist", "invite", `${label}-${stamp}@e2e.example`], {
    encoding: "utf8",
    env: {
      ...process.env,
      DAN_MONGODB_URI: process.env.DAN_E2E_CLOUD_MONGODB_URI ?? "mongodb://127.0.0.1:27017",
      DAN_DATABASE: process.env.DAN_E2E_CLOUD_DATABASE ?? "dan_cloud",
      DAN_DASHBOARD_ORIGINS: "http://localhost:3000",
    },
  }).match(/http:\/\/localhost:3000\/join#[0-9a-f]{64}/)![0];
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto(invite);
  await page.getByLabel("Your name").fill("Sam Lee");
  await page.getByLabel("Choose a password").fill("three small words");
  await page.getByLabel("Shop name").fill(`${label} ${stamp}`);
  await page.getByRole("radio", { name: new RegExp(`^${kind}`) }).check();
  await expect(page.getByTestId("join-address")).toHaveAttribute("data-available", "true");
  await page.getByRole("button", { name: "Create my shop" }).click();
  await expect(page.getByTestId("menu-empty")).toBeVisible({ timeout: 20_000 });
}
