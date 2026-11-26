import { expect, test, type Page } from "@playwright/test";

/**
 * Focus mode: a tablet locked to one job. The first test runs on the demo.
 * The second needs a real shop server and the shop's customer API (on the
 * cloud), to place an eat-in order for a table:
 *
 *   DAN_E2E_SERVER_URL=… DAN_E2E_PIN=… DAN_E2E_PUBLIC_URL=… npx playwright test focus
 */
const server = process.env.DAN_E2E_SERVER_URL;
const pin = process.env.DAN_E2E_PIN ?? "";
const publicApi = process.env.DAN_E2E_PUBLIC_URL;
const customerSite = process.env.DAN_E2E_CUSTOMER_ORIGIN ?? "http://localhost:3001";

async function holdLock(page: Page, ms: number) {
  const box = (await page.getByTestId("focus-unlock").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function lockTo(page: Page, position: "kitchen" | "pass" | "till" | "board") {
  await page.getByTestId("focus-button").first().click();
  await page.getByTestId(`focus-${position}`).click();
  await expect(page.getByTestId("focus-status")).toBeVisible();
}

test("a tablet locked to the kitchen stays locked, filters by station without hiding, and unlocks after a 3 second hold", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/shop/orders?demo=1");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();

  await page.getByTestId("focus-button").first().click();
  await page.getByTestId("focus-dialog").getByRole("button", { name: /^Wok/ }).click();
  await page.getByTestId("focus-kitchen").click();
  await expect(page).toHaveURL(/\/shop\/kitchen$/);
  const status = page.getByTestId("focus-status");
  await expect(status).toHaveText("Focus mode on: Kitchen · Wok only · Hold the lock 3 seconds to exit");
  // No menu while locked.
  await expect(page.getByRole("link", { name: /^Sales/ })).toHaveCount(0);

  // Every open ticket is there; those with nothing for the wok are greyed, not hidden.
  const tickets = page.getByTestId("kitchen-ticket");
  await expect(tickets.first()).toBeVisible();
  const total = await tickets.count();
  expect(total).toBeGreaterThan(1);
  await expect(page.locator('[data-testid="kitchen-ticket"][data-for-picked="false"]').first()).toBeVisible();
  for (const ticket of await tickets.all()) {
    const state = await ticket.getAttribute("data-status");
    // The glow is the column's colour: green new, blue preparing, red ready; grey once done.
    if (state === "completed") await expect(ticket).toHaveClass(/glow-done/);
    else await expect(ticket).toHaveAttribute("style", new RegExp(`--glow: ${{ new: "#1f9d55", preparing: "#2f6fdb", ready: "#d7372a" }[state!]}`));
  }
  // Adding the fryer brings more tickets into the filter, none leave the screen.
  await page.getByTestId("station-picker").getByRole("button", { name: /^Fryer/ }).click();
  await expect(status).toContainText("Wok, Fryer only");
  await expect(tickets).toHaveCount(total);

  // Another screen goes straight back to the kitchen; a reload stays locked.
  await page.goto("/shop/sales");
  await expect(page).toHaveURL(/\/shop\/kitchen$/);
  await page.reload();
  await expect(status).toContainText("Kitchen");

  // A tap, or a hold under 3 seconds, does not unlock.
  await page.getByTestId("focus-unlock").click();
  await expect(status).toBeVisible();
  await holdLock(page, 1500);
  await expect(status).toBeVisible();

  await holdLock(page, 3300);
  await expect(page).toHaveURL(/\/shop\/orders$/);
  await expect(status).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Sales/ })).toBeVisible();
});

test("kitchen and pass tablets follow a table's order from new to served", async ({ browser }) => {
  test.skip(!server || !publicApi, "Set DAN_E2E_SERVER_URL and DAN_E2E_PUBLIC_URL to run this.");
  test.setTimeout(90_000);
  const sign = async (position: "kitchen" | "pass") => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await page.goto("/connect");
    await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
    await page.getByLabel("Shop server").fill(server!);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await page.getByRole("button", { name: "PIN", exact: true }).click();
    await page.getByLabel("PIN").fill(pin);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
    await lockTo(page, position);
    return page;
  };
  const kitchen = await sign("kitchen");
  const pass = await sign("pass");
  await kitchen.waitForTimeout(1000);

  const customer = `Focus ${Date.now()}`;
  const placed = await kitchen.request.post(`${publicApi}/graphql`, {
    headers: { origin: customerSite },
    data: {
      query: "mutation($i: PlaceOrderInput!) { placeOrder(input: $i) { order { number } } }",
      variables: { i: { customerName: customer, phone: "07700 900321", lines: [{ number: 81, qty: 2 }], payWith: "at_shop", allergensConfirmed: true, table: "7", notes: customer } },
    },
  });
  // The customer API limits orders from one address: a rerun too soon is refused here, plainly.
  expect((await placed.json()) as { errors?: unknown }).not.toHaveProperty("errors");

  // New: green, on the kitchen tablet within seconds, its station (egg fried rice is a wok dish) large.
  // (The kitchen shows the note, not the name, so the note finds the ticket.)
  const ticket = kitchen.getByTestId("kitchen-ticket").filter({ hasText: customer });
  await expect(ticket).toHaveAttribute("data-status", "new", { timeout: 15_000 });
  // The glow is the column's own colour (the owner's board).
  await expect(ticket).toHaveAttribute("style", /--glow: #1f9d55/);
  await expect(ticket.getByTestId("station-strip")).toContainText("Wok");

  await ticket.getByRole("button", { name: "Start" }).click();
  await expect(ticket).toHaveAttribute("data-status", "preparing");
  // The glow is the column's own colour (the owner's board).
  await expect(ticket).toHaveAttribute("style", /--glow: #2f6fdb/);
  // A person's pause: taps in the moment after a change count as a double tap.
  await kitchen.waitForTimeout(800);
  await ticket.getByRole("button", { name: "Ready" }).click();
  // The glow is the column's own colour (the owner's board).
  await expect(ticket).toHaveAttribute("style", /--glow: #d7372a/);

  // The pass sees it, the table number repeated large.
  const handOver = pass.getByTestId("pass-ticket").filter({ hasText: customer });
  await expect(handOver).toBeVisible({ timeout: 15_000 });
  await expect(handOver.getByTestId("where-table")).toHaveText("7");
  await expect(handOver.getByTestId("pass-due")).toBeVisible();
  await handOver.getByRole("button", { name: "Served" }).click();
  await expect(handOver).toHaveCount(0);

  // Done: greyed on the kitchen tablet, still there.
  await expect(ticket).toHaveAttribute("data-status", "completed", { timeout: 15_000 });
  await expect(ticket).toHaveClass(/glow-done/);
});
