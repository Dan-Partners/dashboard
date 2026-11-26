import { expect, test, type Page } from "@playwright/test";

/**
 * The Orders page: the board or a list, and Create order (by picking from
 * the menu, or with the till's keypad). In the demo first; then, with a real
 * shop server (DAN_E2E_SERVER_URL, DAN_E2E_PIN), the counter PIN takes an
 * order from the menu and finds it in the shop's own order history.
 */
const server = process.env.DAN_E2E_SERVER_URL;
const pin = process.env.DAN_E2E_PIN ?? "";

async function openDemo(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/shop/orders?demo=1");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
}

test("orders as a list: searched, narrowed, opened and moved on; the choice is kept on the device", async ({ page }) => {
  await openDemo(page);
  const screen = page.locator("[data-orders-layout]");
  await expect(screen).toHaveAttribute("data-orders-layout", "board");
  await page.getByTestId("orders-layout-list").click();
  await expect(screen).toHaveAttribute("data-orders-layout", "list");
  const rows = page.getByTestId("list-row");
  await expect(rows.first()).toBeVisible();
  const all = await rows.count();
  expect(all).toBeGreaterThan(5);
  // The demo's orders fit one page: the list says it has reached the end.
  await expect(page.getByTestId("list-end")).toHaveText("That is every order.");

  // Newest first.
  const numbers = (await rows.getByTestId("list-number").allTextContents()).map((text) => Number(text.replace("#", "")));
  expect(numbers).toEqual([...numbers].sort((a, b) => b - a));

  // By name, in any case; by number; by phone digits.
  const search = page.getByTestId("list-search");
  await search.fill("WONG");
  await expect(rows.first().getByTestId("list-customer")).toContainText("Mrs Wong");
  for (const customer of await rows.getByTestId("list-customer").allTextContents()) expect(customer).toContain("Mrs Wong");
  expect(await rows.count()).toBeLessThan(all);
  await search.fill("#1854");
  await expect(rows).toHaveCount(1);
  await expect(rows.getByTestId("list-number")).toHaveText("#1854");
  await search.fill("900 219");
  await expect(rows.first().getByTestId("list-customer")).toContainText("Aisha Khan");
  for (const customer of await rows.getByTestId("list-customer").allTextContents()) expect(customer).toContain("07700 900219");
  await search.fill("nobody at all");
  await expect(page.getByTestId("list-none")).toHaveText("No orders match.");
  await search.fill("");
  await expect(rows).toHaveCount(all);

  // Open, completed, cancelled.
  const which = page.getByTestId("list-which");
  await which.selectOption("completed");
  await expect(rows.first()).toHaveAttribute("data-status", "completed");
  for (const row of await rows.all()) await expect(row).toHaveAttribute("data-status", "completed");
  await which.selectOption("open");
  await expect(rows.first()).not.toHaveAttribute("data-status", "completed");
  for (const row of await rows.all()) await expect(row).toHaveAttribute("data-status", /^(new|preparing|ready)$/);
  const open = await rows.count();
  await which.selectOption("all");

  // Today only, then every day again.
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByTestId("list-day")).not.toHaveValue("");
  await expect(async () => expect(await rows.count()).toBeLessThan(all)).toPass();
  expect(await rows.count()).toBeGreaterThanOrEqual(open);
  await page.getByRole("button", { name: "All days" }).click();
  await expect(rows).toHaveCount(all);

  // A row opens its docket; the order moves on from there, and the row follows.
  const row = page.locator('[data-testid="list-row"]', { has: page.getByText("#1854", { exact: true }) });
  await expect(row.getByTestId("list-where")).toHaveText("Preparing");
  await row.getByRole("button").first().click();
  const docket = row.getByTestId("list-docket");
  await expect(docket).toContainText("Set meal A for one");
  await docket.getByRole("button", { name: "Ready", exact: true }).click();
  await expect(row.getByTestId("list-where")).toHaveText("Ready");
  await expect(row).toHaveAttribute("data-status", "ready");

  // The list is this device's choice from now on; the board is one tap away.
  await page.reload();
  await expect(screen).toHaveAttribute("data-orders-layout", "list");
  await expect(rows.first()).toBeVisible();
  await page.getByTestId("orders-layout-board").click();
  await expect(page.locator("section[data-column='ready'] article", { hasText: "#1854" })).toBeVisible();
});

test("create order: picked from the menu or keyed on the till; the old Till address still arrives", async ({ page }) => {
  await openDemo(page);
  // The Till is no longer in the menu: Create order is on the Orders page.
  await expect(page.getByRole("link", { name: /^Till/ })).toHaveCount(0);
  await page.getByTestId("create-order").click();
  await expect(page).toHaveURL(/\/shop\/orders\/new$/);
  await expect(page.getByRole("heading", { name: "Create order" })).toBeVisible();
  await expect(page.getByTestId("create-mode-menu")).toHaveAttribute("aria-pressed", "true");

  // From the menu: a category, a search by number, a search by name.
  const picker = page.getByTestId("menu-picker");
  const dishes = picker.getByTestId("menu-picker-dish");
  const everything = await dishes.count();
  expect(everything).toBeGreaterThan(20);
  await picker.getByRole("button", { name: /^Rice/ }).click();
  await expect(picker.locator('[data-number="81"]')).toBeVisible();
  await expect(picker.locator('[data-number="1"]')).toHaveCount(0);
  await picker.locator('[data-number="81"]').click();
  await picker.locator('[data-number="81"]').click();
  const slip = page.getByTestId("order-slip");
  await expect(slip.getByTestId("slip-line")).toHaveCount(1);
  await expect(slip.getByTestId("slip-qty")).toHaveText("2");
  await expect(picker.locator('[data-number="81"]')).toContainText("×2");
  const search = page.getByTestId("menu-picker-search");
  await search.fill("3");
  await expect(dishes.first()).toHaveAttribute("data-number", "3");
  await search.fill("prawn toast");
  await expect(dishes).toHaveCount(1);
  await dishes.first().click();
  await expect(slip.getByTestId("slip-line")).toHaveCount(2);
  await search.fill("no such dish");
  await expect(picker).toContainText("Nothing on the menu matches.");
  await search.fill("");
  // Typing a number outside the search box does nothing here: the keys are the till's.
  await page.keyboard.press("8");
  await expect(slip.getByTestId("slip-line")).toHaveCount(2);

  await slip.getByLabel("Name").fill("Picker Test");
  await slip.getByRole("button", { name: "Send to kitchen" }).click();
  await expect(page.getByTestId("order-sent")).toContainText("Sent to the kitchen #");
  const picked = (await page.getByTestId("order-sent").textContent())!.match(/#(\d+)/)![1];
  await expect(slip.getByTestId("slip-line")).toHaveCount(0);

  // The till: keyed by dish number, as it always was.
  await page.getByTestId("create-mode-till").click();
  await expect(page.getByTestId("menu-picker")).toHaveCount(0);
  for (const key of ["2", "Times", "8", "1"]) await page.getByRole("button", { name: key, exact: true }).click();
  await expect(page.getByText("Egg fried rice · 蛋炒飯")).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.keyboard.press("3");
  await page.keyboard.press("Enter");
  await expect(slip.getByTestId("slip-line")).toHaveCount(2);
  await page.getByRole("button", { name: "Send to kitchen" }).click();
  await expect(page.getByTestId("order-sent")).toContainText("Sent to the kitchen #");
  const keyed = (await page.getByTestId("order-sent").textContent())!.match(/#(\d+)/)![1];
  expect(Number(keyed)).toBe(Number(picked) + 1);

  // The keypad is this device's choice now; the old Till address leads here too.
  await page.reload();
  await expect(page.getByTestId("till-keypad")).toBeVisible();
  await page.getByTestId("create-mode-menu").click();
  await page.goto("/shop/till");
  await expect(page).toHaveURL(/\/shop\/orders\/new$/);
  await expect(page.getByTestId("till-keypad")).toBeVisible();

  // Both orders are on the board, and in the list by name.
  await page.getByRole("link", { name: "← Back to orders" }).click();
  await expect(page.getByTestId("docket-number").filter({ hasText: `#${keyed}` })).toBeVisible();
  await page.getByTestId("orders-layout-list").click();
  await page.getByTestId("list-search").fill("picker test");
  await expect(page.getByTestId("list-row")).toHaveCount(1);
  await expect(page.getByTestId("list-number")).toHaveText(`#${picked}`);

  // On a phone, New order sits in the bar where the till was.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("navigation", { name: "Dan" }).getByRole("link", { name: /^New order/ }).click();
  await expect(page).toHaveURL(/\/shop\/orders\/new$/);
  await page.getByTestId("create-mode-menu").click();
  await page.getByTestId("menu-picker").locator('[data-number="1"]').click();
  // The slip is under the whole menu: a bar says what is on it and goes there.
  await expect(page.getByTestId("to-slip")).toContainText("×1");
  await page.getByTestId("to-slip").click();
  await expect(page.getByTestId("order-slip").getByRole("button", { name: "Send to kitchen" })).toBeInViewport();
});

test("the counter PIN takes an order from the menu and finds it in the shop's order history", async ({ page }) => {
  test.skip(!server || !pin, "Set DAN_E2E_SERVER_URL and DAN_E2E_PIN to run against a real shop server.");
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/connect");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.getByLabel("Shop server").fill(server!);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "PIN", exact: true }).click();
  await page.getByLabel("PIN").fill(pin);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();

  const stamp = Date.now().toString(36);
  const name = `List ${stamp}`;
  const phone = `07700 ${String(Date.now()).slice(-6)}`;
  await page.getByTestId("create-order").click();
  await page.getByTestId("menu-picker-search").fill("81");
  await page.getByTestId("menu-picker-dish").first().click();
  const slip = page.getByTestId("order-slip");
  await slip.getByRole("button", { name: "Phone", exact: true }).click();
  await slip.getByLabel("Name").fill(name);
  await slip.getByLabel("Phone number").fill(phone);
  await slip.getByRole("button", { name: "Send to kitchen" }).click();
  await expect(page.getByTestId("order-sent")).toContainText("Sent to the kitchen #");
  const number = (await page.getByTestId("order-sent").textContent())!.match(/#(\d+)/)![1];

  await page.getByRole("link", { name: "← Back to orders" }).click();
  await page.getByTestId("orders-layout-list").click();
  const rows = page.getByTestId("list-row");
  // The newest order is the first row.
  await expect(rows.first().getByTestId("list-number")).toHaveText(`#${number}`);
  // This shop has taken hundreds of test orders: older pages come 50 at a time.
  if (await page.getByTestId("list-more").isVisible()) {
    const before = await rows.count();
    expect(before).toBe(50);
    await page.getByTestId("list-more").click();
    await expect(async () => expect(await rows.count()).toBeGreaterThan(before)).toPass();
  }

  const search = page.getByTestId("list-search");
  await search.fill(name.toUpperCase());
  await expect(rows).toHaveCount(1);
  await expect(rows.getByTestId("list-number")).toHaveText(`#${number}`);
  await search.fill(phone.replace(/\D/g, "").slice(-8));
  await expect(rows).toHaveCount(1);
  await expect(rows.getByTestId("list-customer")).toContainText(name);
  await search.fill(`#${number}`);
  await expect(rows.first().getByTestId("list-number")).toHaveText(`#${number}`);
  // A name is text, never a pattern.
  await search.fill(".*");
  await expect(page.getByTestId("list-none")).toBeVisible();

  // Narrowed to completed orders it is not there; moved on from its docket, it follows.
  await search.fill(name);
  await page.getByTestId("list-which").selectOption("completed");
  await expect(page.getByTestId("list-none")).toBeVisible();
  await page.getByTestId("list-which").selectOption("open");
  await expect(rows).toHaveCount(1);
  await rows.getByRole("button").first().click();
  await rows.getByTestId("list-docket").getByRole("button", { name: "Ready", exact: true }).click();
  await expect(rows.getByTestId("list-where")).toHaveText("Ready");
});
