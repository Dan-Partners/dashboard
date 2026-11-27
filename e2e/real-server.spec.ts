import { expectPinCannotSee, openSettings, STAFF_NAME } from "./settings";
import { expect, test, type Page } from "@playwright/test";
import { openTill } from "./create-order";
import { hasCloud } from "./settings";

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
 *
 * The no-cloud warning test expects a server with no Dan cloud set up (no
 * DAN_CLOUD_URL), so the owner is told the data is on that machine only.
 */
const server = process.env.DAN_E2E_SERVER_URL;
const ownerEmail = process.env.DAN_E2E_OWNER_EMAIL ?? "";
const ownerPassword = process.env.DAN_E2E_OWNER_PASSWORD ?? "";
const pin = process.env.DAN_E2E_PIN ?? "";
/** The shop's public API and the customer site's address, for placing an online order. */
const publicApi = process.env.DAN_E2E_PUBLIC_URL;
const customerSite = process.env.DAN_E2E_CUSTOMER_ORIGIN ?? "http://localhost:3001";

test.skip(!server, "Set DAN_E2E_SERVER_URL to run against a real shop server.");

async function connect(page: Page) {
  await page.goto("/connect");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.getByLabel("Shop server").fill(server!);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Golden Dragon" })).toBeVisible();
}

test("the counter PIN runs service but cannot see sales or edit dishes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await connect(page);
  await page.getByRole("button", { name: "PIN", exact: true }).click();

  await page.getByLabel("Your name").fill(STAFF_NAME);

  await page.getByLabel("PIN").fill("0000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("connect-error")).toContainText("not recognised");

  await page.getByLabel("Your name").fill(STAFF_NAME);

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

  await openTill(page);
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

  // The shop's theme is the owner's: with the PIN, Settings has no Shop section (DAN-33).
  await page.goto("/shop/orders");
  await expectPinCannotSee(page, "shop");
  await expect(page.getByTestId("theme-button")).toHaveCount(0);
});

/** Asks the shop server for its theme directly, as another tablet would. */
async function serverTheme(page: Page): Promise<string> {
  const response = await page.request.post(`${server}/graphql`, {
    data: { query: "{ ping { theme { preset typeface } } }" },
  });
  const body = (await response.json()) as { data: { ping: { theme: { preset: string; typeface: string } } } };
  return `${body.data.ping.theme.preset}/${body.data.ping.theme.typeface}`;
}

test("the owner's theme is saved on the shop server for every tablet", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await connect(page);
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();

  await openSettings(page, "shop");
  await page.getByTestId("theme-button").filter({ visible: true }).click();
  await expect(page.getByText("Saved on the shop server")).toBeVisible();
  await page.getByTestId("theme-jade").click();
  await page.getByTestId("typeface-source").click();
  await expect.poll(() => serverTheme(page)).toBe("jade/source");

  // Another tablet, signing in fresh, paints in the shop's theme.
  const tablet = await page.context().browser()!.newPage();
  await tablet.goto("/connect");
  await tablet.evaluate(() => localStorage.clear());
  await tablet.reload();
  await tablet.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await tablet.getByLabel("Shop server").fill(server!);
  await tablet.getByRole("button", { name: "Connect", exact: true }).click();
  await tablet.getByRole("button", { name: "PIN", exact: true }).click();
  await tablet.getByLabel("Your name").fill(STAFF_NAME);
  await tablet.getByLabel("PIN").fill(pin);
  await tablet.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(tablet.locator("html")).toHaveAttribute("data-theme", "jade");
  await expect(tablet.locator("html")).toHaveAttribute("data-typeface", "source");
  await tablet.close();

  // Put the shop back to Dan for the next run.
  await page.getByTestId("theme-dan").click();
  await page.getByTestId("typeface-plex").click();
  await expect.poll(() => serverTheme(page)).toBe("dan/plex");
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

test("an online order reaches an open tablet live, with no refresh", async ({ page }) => {
  test.skip(!publicApi, "Set DAN_E2E_PUBLIC_URL to the shop's public API to run this.");
  await page.setViewportSize({ width: 1280, height: 900 });
  await connect(page);
  await page.getByRole("button", { name: "PIN", exact: true }).click();
  await page.getByLabel("Your name").fill(STAFF_NAME);
  await page.getByLabel("PIN").fill(pin);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  // Let the live channel open.
  await page.waitForTimeout(1000);

  const customer = `Live ${Date.now()}`;
  const placed = await page.request.post(`${publicApi}/graphql`, {
    headers: { origin: customerSite },
    data: {
      query: "mutation($i: PlaceOrderInput!) { placeOrder(input: $i) { order { number } } }",
      variables: { i: { customerName: customer, phone: "07700 900555", lines: [{ number: 81, qty: 1 }], payWith: "at_shop", allergensConfirmed: true } },
    },
  });
  // The customer API limits orders from one address: a rerun too soon is refused here, plainly.
  expect((await placed.json()) as { errors?: unknown }).not.toHaveProperty("errors");

  // No reload, no waiting for a timer: it is pushed.
  const docket = page.locator("article", { hasText: customer });
  // Through the cloud, then the shop server's sync: a few seconds.
  await expect(docket).toBeVisible({ timeout: 10_000 });
  await expect(docket.getByTestId("docket-payment")).toContainText("To pay at the shop");
  // The cloud leaves the number to the shop server, which gives it on arrival.
  await expect(docket.getByTestId("docket-number")).toHaveText(/^#\d+$/);
});

test("an order from a table's link shows its table and is marked served", async ({ page }) => {
  test.skip(!publicApi, "Set DAN_E2E_PUBLIC_URL to the shop's public API to run this.");
  await page.setViewportSize({ width: 1280, height: 900 });
  await connect(page);
  await page.getByRole("button", { name: "PIN", exact: true }).click();
  await page.getByLabel("Your name").fill(STAFF_NAME);
  await page.getByLabel("PIN").fill(pin);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await page.waitForTimeout(1000);

  const customer = `Table ${Date.now()}`;
  await page.request.post(`${publicApi}/graphql`, {
    headers: { origin: customerSite },
    data: {
      query: "mutation($i: PlaceOrderInput!) { placeOrder(input: $i) { order { number } } }",
      variables: { i: { customerName: customer, phone: "07700 900777", lines: [{ number: 81, qty: 1 }], payWith: "at_shop", allergensConfirmed: true, table: "7" } },
    },
  });

  const docket = page.locator("article", { hasText: customer });
  // Through the cloud, then the shop server's sync: a few seconds.
  await expect(docket).toBeVisible({ timeout: 10_000 });
  await expect(docket.getByTestId("docket-table")).toHaveText("Eat in · Table 7");
  await docket.getByRole("button", { name: "Accept", exact: true }).click();
  // A person's pause: taps in the moment after a change count as a double tap.
  // (The quiet moment starts again when the change has landed, and that takes a real server a moment.)
  await page.waitForTimeout(1500);
  await docket.getByRole("button", { name: "Ready", exact: true }).click();
  await expect(docket.getByRole("button", { name: "Served", exact: true })).toBeVisible();
});

test("the owner is warned when there is no Dan cloud, the counter is not", async ({ page }) => {
  test.skip(await hasCloud(server!), "needs a shop server with no Dan cloud key (a keyed one gives its tablets the cloud)");
  await page.setViewportSize({ width: 1280, height: 900 });
  await connect(page);
  await page.getByRole("button", { name: "PIN", exact: true }).click();
  await page.getByLabel("Your name").fill(STAFF_NAME);
  await page.getByLabel("PIN").fill(pin);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("cloud-notice")).toHaveCount(0);

  await connect(page);
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const notice = page.getByTestId("cloud-notice");
  await expect(notice).toContainText("No Dan cloud: this shop's data is only on the shop server");

  // Hidden for the rest of the day, even after a reload.
  await notice.getByRole("button", { name: "Hide for today" }).click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("cloud-notice")).toHaveCount(0);
});

test("the status corner shows the shop server connected, no cloud yet, and stamps are off", async ({ page }) => {
  test.skip(await hasCloud(server!), "needs a shop server with no Dan cloud key (a keyed one gives its tablets the cloud)");
  await page.setViewportSize({ width: 1280, height: 900 });
  await connect(page);
  await page.getByRole("button", { name: "PIN", exact: true }).click();
  await page.getByLabel("Your name").fill(STAFF_NAME);
  await page.getByLabel("PIN").fill(pin);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  const status = page.getByTestId("connection-status");
  await expect(status).toHaveAttribute("data-shop", "connected");
  await expect(status).toHaveAttribute("data-cloud", "not_set");
  await expect(page.getByTestId("sync-line")).toHaveText("Sync not running yet");
  await status.click();
  await expect(page.getByTestId("connection-details")).toContainText(server!);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: /^Stamps/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Stamp", exact: true })).toHaveCount(0);
});
