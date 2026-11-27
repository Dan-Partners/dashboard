import { expect, test, type Page } from "@playwright/test";
import { openSettings } from "./settings";

/**
 * Dan's deal and terms, end to end: a shop server syncing to a Dan cloud run
 * with Stripe platform keys pointed at a stand-in Stripe (DAN_STRIPE_API_BASE),
 * the shop's Stripe account connected and ready, and no acceptance yet.
 * Never the real Stripe.
 *
 *   DAN_E2E_DEAL=1 DAN_E2E_SERVER_URL=… DAN_E2E_CLOUD_URL=…/staff DAN_E2E_OWNER_EMAIL=… DAN_E2E_OWNER_PASSWORD=… \
 *   DAN_E2E_CUSTOMER_ORIGIN=http://localhost:3001 DAN_E2E_FAKE_STRIPE=http://127.0.0.1:9130 npx playwright test deal
 */
const server = process.env.DAN_E2E_SERVER_URL;
const cloud = process.env.DAN_E2E_CLOUD_URL;
const ownerEmail = process.env.DAN_E2E_OWNER_EMAIL ?? "";
const ownerPassword = process.env.DAN_E2E_OWNER_PASSWORD ?? "";
const customerSite = process.env.DAN_E2E_CUSTOMER_ORIGIN;
const fakeStripe = process.env.DAN_E2E_FAKE_STRIPE;

async function signIn(page: Page) {
  await page.goto("/connect");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.getByLabel("Shop server").fill(server!);
  await page.getByLabel("Dan cloud (optional)").fill(cloud!);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
}

test("card payments wait for the owner to accept Dan's terms and deal; then customers can pay by card", async ({ page, browser }) => {
  test.skip(!process.env.DAN_E2E_DEAL || !server || !cloud || !ownerEmail || !customerSite || !fakeStripe, "Needs the cloud with a stand-in Stripe; see the comment at the top.");
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);
  await openSettings(page, "subscription");

  // Stripe is ready, but cards wait for the terms.
  await expect(page.getByTestId("payments-waiting-terms")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("deal-words")).toHaveText(
    "Your first 100 card orders are free of any Dan fee. After that, Dan's fee is 3% of each card payment, at most £1.00 per order.",
  );
  await expect(page.getByTestId("deal-usage")).toHaveText(/^\d+ of 100 free card orders used$/);
  await expect(page.getByTestId("terms-text")).toContainText("You are the seller and the merchant of record");

  // The customer site offers no card yet.
  const customer = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await customer.goto(`${customerSite}/`);
  await customer.getByRole("button", { name: /Rice/ }).first().click();
  await customer.getByRole("button", { name: /^Add: 81/ }).click();
  await customer.goto(`${customerSite}/checkout`);
  await expect(customer.getByTestId("pay-at_shop")).toBeVisible();
  await expect(customer.getByTestId("pay-card")).toHaveCount(0);

  // Accepting needs a name and the tick.
  await page.getByTestId("deal-accept-button").click();
  await expect(page.getByTestId("deal-accept")).toContainText("Type your name and tick the box");
  await page.getByLabel("Your full name").fill("Mei Chan");
  await page.getByTestId("deal-agree").check();
  await page.getByTestId("deal-accept-button").click();
  await expect(page.getByTestId("payments-waiting-terms")).toHaveCount(0);
  await expect(page.getByTestId("deal-accepted")).toContainText(`Mei Chan (${ownerEmail})`);
  await expect(page.getByTestId("deal-accepted")).toContainText("Terms version 2026-11-26");
  await expect(page.getByTestId("deal-accept")).toHaveCount(0);
  // Dan's subscription, while no membership exists (RK, 27 Nov 2026).
  await expect(page.getByTestId("nothing-else")).toHaveText("Dan charges nothing else today.");

  // Integrations says Stripe is connected; its page says cards are on and Stripe pays the shop's bank.
  await openSettings(page, "integrations");
  await expect(page.locator('[data-integration="stripe"]').filter({ visible: true })).toHaveAttribute("data-state", "connected");
  await page.locator('[data-integration="stripe"]').filter({ visible: true }).click();
  await expect(page.getByTestId("payments-on")).toBeVisible();
  await expect(page.getByTestId("stripe-cards")).toHaveText("On");
  await expect(page.getByTestId("stripe-payouts")).toHaveText("On");
  await expect(page.getByTestId("stripe-dashboard")).toHaveAttribute("href", "https://dashboard.stripe.com/");

  // Customers can pay by card now, on the shop's own account, with no Dan fee in the free orders.
  await expect(async () => {
    await customer.reload();
    await expect(customer.getByTestId("pay-card")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await customer.getByTestId("pay-card").check();
  await customer.getByTestId("allergen-confirm").check();
  await customer.getByLabel("Name").fill("Kai");
  await customer.getByLabel("Phone").fill(`07700 9${String(Date.now()).slice(-5)}`);
  await customer.getByTestId("send-order").click();
  await expect(async () => {
    const asked = (await (await fetch(`${fakeStripe}/__state`)).json()) as { intents: { account: string | null; fee: string | null }[] };
    expect(asked.intents.at(-1)).toMatchObject({ account: "acct_e2e", fee: null });
  }).toPass({ timeout: 15_000 });
});
