import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { cloudOn, cloudSkip, joinNewShop } from "./cloud-join";
import { openSettings } from "./settings";

/**
 * The owner buys the shop server (RK, 27 Nov 2026, DAN-35): Settings,
 * Subscription offers it at Stripe's prices; the owner accepts Dan's terms,
 * pays through Stripe Checkout (the stand-in, never the real Stripe), and Dan
 * switches it on by command. A failed month is flagged; cancelling runs to the
 * month's end; the end switches it off.
 *
 * Needs what e2e/accounts.spec.ts needs (a running cloud and its command), the
 * stand-in Stripe (DAN_E2E_FAKE_STRIPE) and the cloud's billing webhook secret
 * (DAN_E2E_STRIPE_BILLING_WEBHOOK_SECRET; the cloud's DAN_STRIPE_BILLING_WEBHOOK_SECRET).
 */
const fakeStripe = process.env.DAN_E2E_FAKE_STRIPE;
const cloud = process.env.DAN_E2E_CLOUD;
const billingSecret = process.env.DAN_E2E_STRIPE_BILLING_WEBHOOK_SECRET;

/** Stripe's notice about Dan's own account, signed as Stripe signs it. */
async function notice(request: APIRequestContext, type: string, object: Record<string, unknown>) {
  const body = JSON.stringify({ type, data: { object } });
  const at = Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", billingSecret!).update(`${at}.${body}`).digest("hex");
  const answer = await request.post(`${cloud}/v1/stripe/billing-webhook`, { headers: { "stripe-signature": `t=${at},v1=${signature}`, "content-type": "application/json" }, data: body });
  expect(answer.status()).toBe(200);
}

function danCloud(...args: string[]): string {
  return execFileSync(process.env.DAN_E2E_CLOUD_BIN!, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      DAN_MONGODB_URI: process.env.DAN_E2E_CLOUD_MONGODB_URI ?? "mongodb://127.0.0.1:27017",
      DAN_DATABASE: process.env.DAN_E2E_CLOUD_DATABASE ?? "dan_cloud",
      DAN_DASHBOARD_ORIGINS: "http://localhost:3000",
    },
  });
}

async function shopServerShows(page: Page, state: string) {
  await page.reload();
  const section = page.getByTestId("shop-server").filter({ visible: true });
  await expect(section).toHaveAttribute("data-state", state, { timeout: 15_000 });
  return section;
}

test("the owner buys the shop server, Dan switches it on, and a cancel runs to the month's end", async ({ page, request }) => {
  test.skip(!cloudOn || !fakeStripe || !billingSecret, `${cloudSkip} Also DAN_E2E_FAKE_STRIPE and DAN_E2E_STRIPE_BILLING_WEBHOOK_SECRET.`);
  test.setTimeout(120_000);
  await joinNewShop(page, "Restaurant", "buyer");
  const slug = await page.evaluate(() => JSON.parse(localStorage.getItem("dan.v1")!).session.addressName as string);
  await openSettings(page, "subscription");

  // Offered at Stripe's prices; Dan's terms first.
  const section = page.getByTestId("shop-server").filter({ visible: true });
  await expect(section.getByTestId("shop-server-price")).toHaveText("£99.00 to set up (usually £220.00), then £5.00 a month. Hardware is extra. No VAT is charged.");
  await expect(section.getByTestId("shop-server-buy")).toBeDisabled();
  await expect(section.getByTestId("shop-server-terms-first")).toBeVisible();
  // Dan's card fee, read from Stripe (DAN-41): the launch offer from the day the shop joined.
  await expect(page.getByTestId("deal-words")).toHaveText(
    /^Launch offer: your first 100 card orders each month are free of any Dan fee, until \d{1,2} \w+ \d{4}\. Otherwise, Dan's fee is 0\.5% \+ 10p of each card payment, at most £1\.00 per order\.$/,
  );
  await expect(page.getByTestId("deal-offer-usage")).toHaveText(/^0 of 100 free card orders used this month \(until \d{1,2} \w+ \d{4}\)$/);
  await page.getByLabel("Your full name").fill("Sam Lee");
  await page.getByTestId("deal-agree").check();
  await page.getByTestId("deal-accept-button").click();
  await expect(page.getByTestId("deal-accepted")).toBeVisible();
  await expect(section.getByTestId("shop-server-buy")).toBeEnabled();

  // To Stripe Checkout (the stand-in: the page itself is not Stripe's, it is never opened for real).
  await page.route("https://checkout.stripe.test/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Stripe Checkout (stand-in)</h1>" }));
  await section.getByTestId("shop-server-buy").click();
  await expect(page).toHaveURL(/^https:\/\/checkout\.stripe\.test\/cs_e2e\d+$/);
  const asked = (await (await request.get(`${fakeStripe}/__state`)).json()) as { checkouts: { customer: string; success: string; prices: string[] }[] };
  const checkout = asked.checkouts.at(-1)!;
  expect(checkout.prices).toEqual(["price_e2e_setup", "price_e2e_monthly"]);
  expect(checkout.success).toBe("http://localhost:3000/shop/settings/subscription?shopServer=paid");

  // Stripe says it is paid; the owner comes back to the page Stripe sends them to.
  await notice(request, "checkout.session.completed", { mode: "subscription", payment_status: "paid", customer: checkout.customer, subscription: `sub_${slug}` });
  await page.goto(checkout.success);
  await expect(page.getByTestId("shop-server").filter({ visible: true })).toHaveAttribute("data-state", "paid", { timeout: 15_000 });
  await expect(page.getByTestId("shop-server-state").filter({ visible: true })).toHaveText("Paid. Dan will be in touch to set up your machine.");
  await expect(page.getByTestId("nothing-else")).toHaveCount(0);

  // Dan switches it on, by command.
  expect(danCloud("shop", "activate", slug)).toContain("Key:");
  let shown = await shopServerShows(page, "paid");
  await expect(shown).toHaveAttribute("data-on", "true");
  await expect(shown.getByTestId("shop-server-state")).toContainText("Your shop server is on.");
  expect(danCloud("shop", "list")).toMatch(new RegExp(`${slug}.*shop server paid`));

  // A failed month: flagged, still on; the card is updated on Stripe's own page.
  await notice(request, "invoice.payment_failed", { customer: checkout.customer, subscription: `sub_${slug}` });
  shown = await shopServerShows(page, "payment_failed");
  await expect(shown).toHaveAttribute("data-on", "true");
  await expect(shown.getByRole("alert")).toContainText("did not go through");
  expect(danCloud("shop", "list")).toMatch(new RegExp(`${slug}.*PAYMENT FAILED`));
  await page.route("https://billing.stripe.test/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Stripe billing (stand-in)</h1>" }));
  await shown.getByTestId("shop-server-manage").click();
  await expect(page).toHaveURL(/^https:\/\/billing\.stripe\.test\//);
  await page.goto("/shop/settings/subscription");
  await notice(request, "invoice.paid", { customer: checkout.customer, subscription: `sub_${slug}` });

  // Cancelled: on until the month's end, then switched off.
  const monthEnd = Math.floor(Date.now() / 1000) + 20 * 24 * 3600;
  await notice(request, "customer.subscription.updated", { id: `sub_${slug}`, customer: checkout.customer, status: "active", cancel_at_period_end: true, items: { data: [{ current_period_end: monthEnd }] } });
  shown = await shopServerShows(page, "cancelling");
  await expect(shown).toHaveAttribute("data-on", "true");
  await expect(shown.getByTestId("shop-server-state")).toContainText("Cancelled. Your shop server works until");
  await notice(request, "customer.subscription.deleted", { id: `sub_${slug}`, customer: checkout.customer, status: "canceled" });
  shown = await shopServerShows(page, "ended");
  await expect(shown).toHaveAttribute("data-on", "false");
  await expect(page.getByTestId("nothing-else")).toBeVisible();
  // Buying it again is possible; switching it on without paying again is not.
  await expect(shown.getByTestId("shop-server-buy")).toBeEnabled();
  expect(() => danCloud("shop", "activate", slug)).toThrow();
});
