import { expect, test, type Page } from "@playwright/test";
import { expectPinCannotSee, openSettings, STAFF_NAME } from "./settings";

/**
 * Settings (DAN-33): every setting in one place, a page per section. In the
 * demo (the owner): the seven sections (Staff since DAN-44), each page, the theme, Integrations,
 * Subscription, and the old pages forwarding. With a real shop server
 * (DAN_E2E_SERVER_URL, DAN_E2E_PIN): what staff see.
 */
const server = process.env.DAN_E2E_SERVER_URL;
const pin = process.env.DAN_E2E_PIN ?? "";

async function openDemo(page: Page, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/shop/orders?demo=1");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
}

test("the owner finds every setting under Settings, a page per section", async ({ page }) => {
  await openDemo(page);
  // One Settings link in place of Ordering & payments, Order board, Payments and Tools; no Theme button beside the menu.
  const nav = page.getByRole("navigation", { name: "Dan" }).first();
  for (const gone of [/^Ordering & payments/, /^Order board/, /^Payments/, /^Tools/]) await expect(nav.getByRole("link", { name: gone })).toHaveCount(0);
  await expect(page.getByTestId("theme-button")).toHaveCount(0);
  await nav.getByRole("link", { name: /^Settings/ }).click();
  const index = page.getByTestId("settings-index").filter({ visible: true });
  await expect(index.getByTestId("settings-section")).toHaveText([
    /^Shop店舖Name, address and theme/,
    /^Staff員工/,
    /^Ordering點餐/,
    /^Order flow訂單流程/,
    /^Tables & printers枱號及打印機/,
    /^Integrations整合服務/,
    /^Subscription訂閱/,
  ]);
  // The menu says where you are, inside a section too.
  await openSettings(page, "flow");
  await expect(nav.getByRole("link", { name: /^Settings/ })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Save board" })).toBeVisible();
  await expect(page.getByTestId("views-section")).toBeVisible();
  await expect(page.getByTestId("stations-section")).toBeVisible();
  await page.getByTestId("settings-back").filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/shop\/settings$/);

  // Shop: the details and the theme, which opens as before.
  await openSettings(page, "shop");
  await expect(page.getByTestId("shop-details")).toBeVisible();
  await page.getByTestId("theme-button").filter({ visible: true }).click();
  await page.getByTestId("theme-jade").click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "jade");

  // Tables & printers.
  await openSettings(page, "tables");
  await expect(page.getByRole("heading", { name: "Table QR codes" })).toBeVisible();
  await expect(page.getByTestId("printers")).toBeVisible();

  // Ordering: no Uber section here any more; Uber Direct's switch says where to connect it.
  await openSettings(page, "ordering");
  await expect(page.getByTestId("uber-section")).toHaveCount(0);
  await page.getByTestId("connect-uberDirect").filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/shop\/settings\/integrations\/uber$/);

  // Integrations: the demo has no Dan cloud, and says so.
  await openSettings(page, "integrations");
  const rows = page.getByTestId("integration").filter({ visible: true });
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute("data-integration", "stripe");
  await expect(rows.nth(0)).toHaveAttribute("data-state", "needs_cloud");
  await expect(rows.nth(1)).toHaveAttribute("data-state", "needs_cloud");
  await rows.nth(0).click();
  await expect(page.getByTestId("stripe-integration")).toContainText("Card payments go through the Dan cloud");

  // Subscription: the deal needs the cloud too; Dan charges nothing else.
  await openSettings(page, "subscription");
  await expect(page.getByTestId("nothing-else").filter({ visible: true })).toHaveText("Dan charges nothing else today.");
});

test("the old pages forward to their place in Settings, the address's details with them", async ({ page }) => {
  await openDemo(page);
  for (const [from, to] of [
    ["/shop/ordering", "/shop/settings/ordering"],
    ["/shop/board", "/shop/settings/flow"],
    ["/shop/tools", "/shop/settings/tables"],
    ["/shop/payments?from=stripe", "/shop/settings/integrations/stripe?from=stripe"],
  ]) {
    await page.goto(from);
    await expect(page).toHaveURL(new RegExp(`${to.replace("?", "\\?")}$`));
    await expect(page.getByTestId("settings-page").filter({ visible: true })).toBeVisible();
  }
});

test("on a phone, Settings is under More", async ({ page }) => {
  await openDemo(page, 390);
  await page.getByRole("button", { name: /^More/ }).click();
  await page.getByRole("link", { name: /^Settings/ }).filter({ visible: true }).click();
  await expect(page.getByTestId("settings-section").filter({ visible: true })).toHaveCount(7);
});

test("staff see Tables & printers only, and still print a table card", async ({ page }) => {
  test.skip(!server || !pin, "needs DAN_E2E_SERVER_URL and DAN_E2E_PIN");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/connect");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.getByLabel("Shop server").fill(server!);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "PIN", exact: true }).click();
  await page.getByLabel("Your name").fill(STAFF_NAME);
  await page.getByLabel("PIN").fill(pin);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();

  await page.getByRole("link", { name: /^Settings/ }).first().click();
  await expect(page.getByTestId("settings-index").filter({ visible: true })).toContainText("print table cards and test the printers");
  for (const section of ["shop", "staff", "ordering", "flow", "integrations", "subscription"] as const) await expectPinCannotSee(page, section);
  // An old address forwards, and says the same.
  await page.goto("/shop/payments");
  await expect(page.getByTestId("settings-owner-only").filter({ visible: true })).toBeVisible();

  await openSettings(page, "tables");
  await page.getByLabel("Ordering address").fill("https://order.goldendragon.example");
  await page.getByLabel("Tables").fill("1-2");
  await expect(page.getByTestId("qr-card")).toHaveCount(2);
  await expect(page.getByTestId("printers")).toBeVisible();
});

test("Integrations says when Stripe holds the shop's payouts, and points the owner to Stripe", async ({ page }) => {
  const cloud = process.env.DAN_E2E_CLOUD_URL;
  const fakeStripe = process.env.DAN_E2E_FAKE_STRIPE;
  const ownerEmail = process.env.DAN_E2E_OWNER_EMAIL ?? "";
  const ownerPassword = process.env.DAN_E2E_OWNER_PASSWORD ?? "";
  // A shop whose Stripe account is connected and whose owner accepted Dan's terms (as refund.spec.ts needs), and the stand-in Stripe.
  test.skip(!server || !cloud || !fakeStripe || !ownerEmail, "needs the shop server, the cloud with the stand-in Stripe, and the owner's sign-in");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/connect");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.getByLabel("Shop server").fill(server!);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();

  try {
    await openSettings(page, "integrations");
    const stripe = page.locator('[data-integration="stripe"]').filter({ visible: true });
    await expect(stripe).toHaveAttribute("data-state", "connected", { timeout: 15_000 });
    await stripe.click();
    await expect(page.getByTestId("stripe-cards")).toHaveText("On");
    await expect(page.getByTestId("stripe-payouts")).toHaveText("On");
    await expect(page.getByTestId("stripe-integration")).toContainText("Dan never holds the money.");

    // Stripe holds the payouts: the owner is told, on the list and on the page. Card payments carry on.
    await fetch(`${fakeStripe}/__payouts/hold`, { method: "POST" });
    await page.reload();
    await expect(page.getByTestId("stripe-payouts")).toHaveText(/^On hold: Stripe needs something from you/, { timeout: 15_000 });
    await expect(page.getByTestId("stripe-cards")).toHaveText("On");
    await expect(page.getByTestId("stripe-dashboard")).toHaveAttribute("target", "_blank");
    await page.goto("/shop/settings/integrations");
    await expect(page.locator('[data-integration="stripe"]').filter({ visible: true })).toHaveAttribute("data-state", "attention", { timeout: 15_000 });
  } finally {
    await fetch(`${fakeStripe}/__payouts/ok`, { method: "POST" });
  }
});
