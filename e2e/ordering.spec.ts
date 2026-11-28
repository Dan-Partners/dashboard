import { expect, test, type Page } from "@playwright/test";
import { expectPinCannotSee, openSettings, STAFF_NAME } from "./settings";

/**
 * Order and payment methods. The first test runs on the demo. The second
 * needs a shop server syncing to a cloud, and the shop's customer site:
 *
 *   DAN_E2E_SERVER_URL=… DAN_E2E_CLOUD_URL=… DAN_E2E_OWNER_EMAIL=… DAN_E2E_OWNER_PASSWORD=… \
 *   DAN_E2E_PIN=… DAN_E2E_CUSTOMER_ORIGIN=http://localhost:3001 npx playwright test ordering
 *
 * It changes the shop's settings and puts them back at the end.
 */
const server = process.env.DAN_E2E_SERVER_URL;
const cloud = process.env.DAN_E2E_CLOUD_URL;
const ownerEmail = process.env.DAN_E2E_OWNER_EMAIL ?? "";
const ownerPassword = process.env.DAN_E2E_OWNER_PASSWORD ?? "";
const pin = process.env.DAN_E2E_PIN ?? "";
const customerSite = process.env.DAN_E2E_CUSTOMER_ORIGIN;

const sw = (page: Page, key: string) => page.getByTestId(`switch-${key}`);

/** Sets a switch on or off whatever it was, so a run does not depend on the last one. */
async function turn(page: Page, key: string, on: boolean) {
  if ((await sw(page, key).getAttribute("aria-checked")) !== String(on)) await sw(page, key).click();
  await expect(sw(page, key)).toHaveAttribute("aria-checked", String(on));
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  return page.getByTestId("ordering-message");
}

test("in the demo, the owner switches methods on and off, with the server's rules, kept in this browser", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/shop/orders?demo=1");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await openSettings(page, "ordering");
  await expect(page.getByRole("heading", { name: "Ordering", exact: true })).toBeVisible();

  // v0.1's offer.
  for (const [key, on] of [["till", true], ["table", true], ["collection", true], ["delivery", false], ["uberDirect", false], ["payInPerson", true], ["stripe", true], ["bankTransfer", false]] as const) {
    await expect(sw(page, key)).toHaveAttribute("aria-checked", String(on));
  }
  await expect(sw(page, "uberDirect")).toBeDisabled();

  // Nothing to pay with is refused, in plain words.
  await sw(page, "payInPerson").click();
  await sw(page, "stripe").click();
  await expect(await save(page)).toHaveText("Keep at least one way to pay switched on.");
  await sw(page, "payInPerson").click();
  await sw(page, "stripe").click();

  // Delivery needs its fee and minimum; bank transfer its details.
  await sw(page, "delivery").click();
  await expect(await save(page)).toContainText("Set the delivery fee and the minimum order");
  await page.getByLabel("Delivery fee (£)").fill("2.50");
  await page.getByLabel("Minimum order for delivery (£)").fill("0");
  await sw(page, "bankTransfer").click();
  await expect(await save(page)).toContainText("Enter the shop's bank details");
  await page.getByLabel("Account name").fill("Golden Dragon Ltd");
  await page.getByLabel("Sort code").fill("12-34");
  await page.getByLabel("Account number").fill("12345678");
  await expect(await save(page)).toHaveText("A sort code is six digits, such as 12-34-56.");
  await page.getByLabel("Sort code").fill("12-34-56");
  await expect(await save(page)).toContainText("Saved.");

  // The till switched off: gone from the menu and from focus mode, kept after a reload.
  await sw(page, "till").click();
  await expect(await save(page)).toContainText("Saved.");
  await page.reload();
  await expect(sw(page, "till")).toHaveAttribute("aria-checked", "false");
  await expect(sw(page, "delivery")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("Sort code")).toHaveValue("12-34-56");
  // With the till off there is no Create order, on the Orders page or in focus mode.
  await page.getByRole("link", { name: /^Orders/ }).first().click();
  await expect(page.getByTestId("orders-layout-board")).toBeVisible();
  await expect(page.getByTestId("create-order")).toHaveCount(0);
  await page.getByTestId("focus-button").first().click();
  await expect(page.getByTestId("focus-till")).toHaveCount(0);
  await page.keyboard.press("Escape");
  // The old Till address leads to Create order, which says the till is off.
  await page.goto("/shop/till");
  await expect(page).toHaveURL(/\/shop\/orders\/new$/);
  await expect(page.getByTestId("till-off")).toBeVisible();
});

async function signIn(page: Page, who: "owner" | "pin") {
  await page.goto("/connect");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.getByLabel("Shop server").fill(server!);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  if (who === "owner") {
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Password").fill(ownerPassword);
  } else {
    await page.getByRole("button", { name: "PIN", exact: true }).click();
    await page.getByLabel("Your name").fill(STAFF_NAME);
    await page.getByLabel("PIN").fill(pin);
  }
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
}

test("a customer's delivery paid by bank transfer waits until staff mark it paid; a table link falls back to collection", async ({ page, browser }) => {
  test.skip(!server || !cloud || !ownerEmail || !pin || !customerSite, "Set the shop server, cloud, owner, PIN and customer site to run this.");
  test.setTimeout(150_000);
  const who = `Grace ${String(Date.now()).slice(-6)}`;
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "owner");
  await openSettings(page, "ordering");
  await turn(page, "table", true);
  await turn(page, "collection", true);
  await turn(page, "delivery", true);
  // Uber off too: with both deliveries on, staff would choose who delivers.
  if (await sw(page, "uberDirect").isEnabled()) await turn(page, "uberDirect", false);
  await page.getByLabel("Delivery fee (£)").fill("2.50");
  await page.getByLabel("Minimum order for delivery (£)").fill("10");
  await turn(page, "bankTransfer", true);
  await page.getByLabel("Account name").fill("Golden Dragon Ltd");
  await page.getByLabel("Reference prefix (optional)").fill("GD");
  await page.getByLabel("Sort code").fill("12-34-56");
  await page.getByLabel("Account number").fill("12345678");
  await expect(await save(page)).toContainText("Saved.");

  // The customer site follows once the settings reach the cloud.
  const customer = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await expect(async () => {
    await customer.goto(`${customerSite}/`);
    await customer.getByRole("button", { name: /Rice/ }).first().click();
    await customer.getByRole("button", { name: /^Add: 81/ }).click({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await customer.getByRole("button", { name: /^Add: 81/ }).click();
  // Saved on the shop's server, the settings reach the cloud a moment later.
  await expect(async () => {
    await customer.goto(`${customerSite}/checkout`);
    await customer.getByTestId("way-delivery").check({ timeout: 3000 });
    await expect(customer.getByTestId("way-delivery").locator("..")).toContainText("£2.50", { timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  // Two egg fried rice (£7.80) is under the £10 minimum.
  await expect(customer.getByTestId("below-minimum")).toBeVisible();
  await customer.getByRole("button", { name: /^Add: 81/ }).click();
  await expect(customer.getByTestId("below-minimum")).toHaveCount(0);
  await expect(customer.getByTestId("checkout-fee")).toContainText("£2.50");
  await expect(customer.getByTestId("checkout-total")).toHaveText("£14.20");
  await customer.getByTestId("allergen-confirm").check();
  await customer.getByLabel("Name").fill(who);
  await customer.getByLabel("Phone").fill(`07700 9${String(Date.now()).slice(-5)}`);
  await customer.getByRole("textbox", { name: "Delivery address" }).fill("14 Whippendell Road");
  await customer.getByLabel("Postcode").fill("wd18 1aa");
  await customer.getByTestId("pay-bank_transfer").check();
  await customer.getByTestId("send-order").click();

  const box = customer.getByTestId("bank-transfer");
  await expect(box).toBeVisible({ timeout: 15_000 });
  await expect(customer.getByTestId("bank-sort-code")).toHaveText("12-34-56");
  await expect(customer.getByTestId("bank-amount")).toHaveText("£14.20");
  const reference = (await customer.getByTestId("bank-reference").textContent())!.trim();
  expect(reference).toMatch(/^GD-[A-Z2-9]{6}$/);
  await expect(box).toContainText("not confirmed until the shop sees the money arrive");
  await expect(customer.getByTestId("order-delivery")).toContainText("14 Whippendell Road, WD18 1AA");

  // Staff see it waiting (from the cloud), not on the board; Paid sends it there.
  await page.getByRole("link", { name: /^Orders/ }).first().click();
  const waiting = page.getByTestId("awaiting-transfer").filter({ hasText: reference });
  await expect(waiting).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("article", { hasText: who })).toHaveCount(0);
  await waiting.getByRole("button", { name: "Paid" }).click();
  await expect(waiting).toHaveCount(0);
  const docket = page.locator("article", { hasText: who });
  await expect(docket).toBeVisible({ timeout: 20_000 });
  await expect(docket.getByTestId("docket-payment")).toHaveText("Paid by bank transfer");
  await expect(docket).toContainText("Delivery · Shop delivery");
  await expect(docket).toContainText("incl. delivery £2.50");
  await expect(customer.getByTestId("bank-transfer")).toHaveCount(0, { timeout: 20_000 });
  await expect(customer.getByTestId("order-payment")).toHaveText("Paid by bank transfer");

  // Table ordering off: a table's link offers collection instead.
  await openSettings(page, "ordering");
  await turn(page, "table", false);
  await expect(await save(page)).toContainText("Saved.");
  await expect(async () => {
    await customer.goto(`${customerSite}/?table=5`);
    await expect(customer.getByTestId("table-off")).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await customer.getByRole("button", { name: /Rice/ }).first().click();
  await expect(customer.getByRole("button", { name: /^Add: 81/ })).toHaveCount(0);
  await customer.getByTestId("table-off").getByRole("button", { name: "Order for collection" }).click();
  // Delivery is on too, so the header offers both.
  await expect(customer.getByTestId("ordering-for")).toHaveText("Collection or delivery");
  await customer.getByRole("button", { name: /Rice/ }).first().click();
  await expect(customer.getByRole("button", { name: /^Add: 81/ })).toBeVisible();

  // The counter PIN does not see them (RK, 27 Nov 2026: Settings shows it Tables & printers only).
  await signIn(page, "pin");
  await expectPinCannotSee(page, "ordering");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);

  // Put the shop back as it was.
  await signIn(page, "owner");
  await openSettings(page, "ordering");
  await turn(page, "delivery", false);
  await turn(page, "bankTransfer", false);
  await turn(page, "table", true);
  await expect(await save(page)).toContainText("Saved.");
});
