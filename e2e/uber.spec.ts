import { expect, test, type Page } from "@playwright/test";
import { openSettings } from "./settings";

/**
 * Delivery by Uber Direct, end to end: a shop server syncing to a Dan cloud
 * run with DAN_SECRETS_KEY and pointed at a stand-in Uber (DAN_UBER_AUTH_BASE
 * and DAN_UBER_API_BASE), and the shop's customer site. Never the real Uber.
 *
 *   DAN_E2E_SERVER_URL=… DAN_E2E_CLOUD_URL=… DAN_E2E_OWNER_EMAIL=… DAN_E2E_OWNER_PASSWORD=… \
 *   DAN_E2E_PIN=… DAN_E2E_CUSTOMER_ORIGIN=http://localhost:3001 DAN_E2E_FAKE_UBER=http://127.0.0.1:9120 \
 *   npx playwright test uber
 *
 * The stand-in Uber takes client secret `secret_e2e` and signs its notices
 * with `whsk_e2e`. The test changes the shop's settings and puts them back.
 */
const server = process.env.DAN_E2E_SERVER_URL;
const cloud = process.env.DAN_E2E_CLOUD_URL;
const ownerEmail = process.env.DAN_E2E_OWNER_EMAIL ?? "";
const ownerPassword = process.env.DAN_E2E_OWNER_PASSWORD ?? "";
const customerSite = process.env.DAN_E2E_CUSTOMER_ORIGIN;
const fakeUber = process.env.DAN_E2E_FAKE_UBER;

const sw = (page: Page, key: string) => page.getByTestId(`switch-${key}`);
async function turn(page: Page, key: string, on: boolean) {
  if ((await sw(page, key).getAttribute("aria-checked")) !== String(on)) await sw(page, key).click();
  await expect(sw(page, key)).toHaveAttribute("aria-checked", String(on));
}

async function signIn(page: Page) {
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
}

/** The stand-in Uber moves a delivery on and sends the shop a signed notice. */
async function uberSays(id: string, status: string) {
  const answer = await fetch(`${fakeUber}/__status`, { method: "POST", body: JSON.stringify({ id, status }) });
  expect((await answer.json()).webhook).toBe(200);
}

test("the owner connects Uber, a customer pays the quote, and staff follow the courier and book again", async ({ page, browser }) => {
  test.skip(!server || !cloud || !ownerEmail || !customerSite || !fakeUber, "Set the shop server, cloud, owner, customer site and stand-in Uber to run this.");
  test.setTimeout(240_000);
  const who = `Uma ${String(Date.now()).slice(-6)}`;
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page);
  await openSettings(page, "integrations", "uber");
  const uber = page.getByTestId("uber-section");

  // Not connected (or left connected by a run before): connect with the shop's own keys.
  await expect(page.getByTestId("uber-state")).toBeVisible({ timeout: 15_000 });
  if ((await page.getByTestId("uber-state").textContent())?.startsWith("Connected")) {
    await uber.getByRole("button", { name: "Disconnect Uber" }).click();
    await expect(page.getByTestId("uber-message")).toContainText("disconnected");
    // Disconnecting switched Uber delivery off in the cloud; wait until the shop's server has that too.
    await expect(async () => {
      await page.reload();
      await expect(sw(page, "uberDirect")).toHaveAttribute("aria-checked", "false", { timeout: 2000 });
    }).toPass({ timeout: 30_000 });
  }
  // Uber's notices go to the cloud's one address, by the shop's address name (DAN-45).
  await expect(page.getByTestId("uber-webhook")).toHaveText(`${new URL(process.env.DAN_E2E_CLOUD ?? "http://localhost:2290").origin}/webhooks/uber/goldendragon`);
  await uber.getByLabel("Customer ID").fill("12345678-abcd-ef01-2345-6789abcd4321");
  await uber.getByLabel("Client ID").fill("client_e2e");
  await uber.getByLabel("Client secret").fill("wrong");
  await uber.getByLabel("Webhook signing key").fill("whsk_e2e");
  await uber.getByRole("button", { name: "Connect Uber" }).click();
  await expect(page.getByTestId("uber-message")).toHaveText("Uber refused these keys. Check them in the Uber Direct dashboard.");
  await uber.getByLabel("Client secret").fill("secret_e2e");
  await uber.getByRole("button", { name: "Connect Uber" }).click();
  await expect(page.getByTestId("uber-state")).toHaveText("Connected to the Uber account ending 4321");

  await uber.getByLabel("When staff accept the order (collects after the cooking time)").check();
  await uber.getByLabel("Usual cooking time (minutes)").fill("15");
  await uber.getByLabel("Change to Uber's fee (£, minus for less)").fill("0.50");
  await uber.getByLabel("Free delivery for food over (£, optional)").fill("");
  await uber.getByLabel("Minimum order for Uber delivery (£)").fill("10");
  await uber.getByLabel("Shop postcode (couriers collect here)").fill("ls1 1aa");
  await uber.getByRole("button", { name: "Save Uber options" }).click();
  await expect(page.getByTestId("uber-message")).toHaveText("Uber options saved.");
  await expect(uber.getByLabel("Shop postcode (couriers collect here)")).toHaveValue("LS1 1AA");

  // Uber delivery only, paid by bank transfer (this cloud has no Stripe). The
  // shop's own server knows Uber is ready once the options reach it.
  await expect(async () => {
    await page.reload();
    await expect(sw(page, "uberDirect")).toBeEnabled({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await turn(page, "collection", true);
  await turn(page, "delivery", false);
  await turn(page, "uberDirect", true);
  await turn(page, "bankTransfer", true);
  await page.getByLabel("Account name").fill("Golden Dragon Ltd");
  await page.getByLabel("Sort code").fill("12-34-56");
  await page.getByLabel("Account number").fill("12345678");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("ordering-message")).toContainText("Saved.");

  // The customer asks for the price at their address: Uber's £4.99 and the shop's 50p.
  const customer = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await expect(async () => {
    await customer.goto(`${customerSite}/`);
    await customer.getByRole("button", { name: /Rice/ }).first().click();
    await customer.getByRole("button", { name: /^Add: 81/ }).click({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await customer.getByRole("button", { name: /^Add: 81/ }).click();
  await customer.getByRole("button", { name: /^Add: 81/ }).click();
  // Saved on the shop's server, the settings reach the cloud a moment later.
  await expect(async () => {
    await customer.goto(`${customerSite}/checkout`);
    await customer.getByTestId("way-delivery").check({ timeout: 3000 });
    await expect(customer.getByTestId("way-delivery").locator("..")).toContainText("The price depends on your address", { timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await expect(customer.getByTestId("send-order")).toBeDisabled();
  await customer.getByRole("textbox", { name: "Delivery address" }).fill("14 Park Row");
  await customer.getByLabel("Postcode").fill("ls1 5hd");
  await customer.getByLabel("Name").fill(who);
  await customer.getByLabel("Phone").fill(`07700 9${String(Date.now()).slice(-5)}`);
  await customer.getByTestId("get-quote").click();
  await expect(customer.getByTestId("quote-fee")).toHaveText("£5.49");
  await expect(customer.getByTestId("checkout-total")).toHaveText("£17.19");
  // No cash for an Uber courier.
  await expect(customer.getByTestId("pay-at_shop")).toHaveCount(0);
  await customer.getByTestId("allergen-confirm").check();
  await customer.getByTestId("pay-bank_transfer").check();
  await customer.getByTestId("send-order").click();
  await expect(customer.getByTestId("bank-transfer")).toBeVisible({ timeout: 15_000 });
  await expect(customer.getByTestId("bank-amount")).toHaveText("£17.19");
  const reference = (await customer.getByTestId("bank-reference").textContent())!.trim();

  // Staff see the money arrive, then accept: the cloud books a courier.
  await page.getByRole("link", { name: /^Orders/ }).first().click();
  const waiting = page.getByTestId("awaiting-transfer").filter({ hasText: reference });
  await expect(waiting).toBeVisible({ timeout: 20_000 });
  await waiting.getByRole("button", { name: "Paid" }).click();
  const docket = page.locator("article", { hasText: who });
  await expect(docket).toBeVisible({ timeout: 20_000 });
  await expect(docket).toContainText("Delivery · Uber Direct");
  await expect(docket).toContainText("incl. delivery £5.49");
  await docket.getByRole("button", { name: "Accept" }).click();
  await expect(docket.getByTestId("courier-status")).toContainText("Courier booked", { timeout: 40_000 });
  await expect(docket.getByTestId("courier-status")).toContainText("Sam");
  const booked = await (await fetch(`${fakeUber}/__state`)).json();
  const booking = booked.bookings.at(-1);
  expect(booking.dropoff_name).toBe(who);
  expect(JSON.parse(booking.dropoff_address).zip_code).toBe("LS1 5HD");
  const first: string = booked.ids.at(-1);

  // The customer sees the courier, with Uber's map.
  await expect(customer.getByTestId("courier-status")).toHaveText(/A courier is booked\./, { timeout: 20_000 });
  await expect(customer.getByTestId("courier-track")).toHaveAttribute("href", `https://track.example/${first}`);

  // Uber calls it off: staff are told and book again.
  await uberSays(first, "canceled");
  const problem = docket.getByTestId("courier-problem");
  await expect(problem).toContainText("Uber called the courier off.", { timeout: 20_000 });
  await problem.getByRole("button", { name: "Book again" }).click();
  await expect(problem).toHaveCount(0, { timeout: 40_000 });
  await expect(docket.getByTestId("courier-status")).toContainText("Courier booked");
  const second: string = (await (await fetch(`${fakeUber}/__state`)).json()).ids.at(-1);
  expect(second).not.toBe(first);

  // On the way, then delivered: the order completes by itself.
  await uberSays(second, "dropoff");
  await expect(docket.getByTestId("courier-status")).toContainText("Courier has the food", { timeout: 20_000 });
  await expect(customer.getByTestId("courier-status")).toContainText("The courier has your food", { timeout: 20_000 });
  await uberSays(second, "delivered");
  await expect(page.getByRole("region", { name: "Completed" }).locator("article", { hasText: who })).toBeVisible({ timeout: 20_000 });
  await expect(customer.getByTestId("order-status")).toHaveAttribute("data-status", "completed", { timeout: 20_000 });

  // Put the shop back as it was.
  await openSettings(page, "ordering");
  await turn(page, "uberDirect", false);
  await turn(page, "bankTransfer", false);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("ordering-message")).toContainText("Saved.");
});
