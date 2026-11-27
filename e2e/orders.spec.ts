import { expect, test, type Page } from "@playwright/test";

/**
 * The Orders page: the board or a list, and Create order (by picking from
 * the menu, or with the till's keypad). In the demo first; then, with a real
 * shop server (DAN_E2E_SERVER_URL, DAN_E2E_PIN), the counter PIN takes an
 * order from the menu and finds it in the shop's own order history.
 *
 * Then the owner's changes to an order: in the demo, and (with the owner's
 * sign-in, DAN_E2E_OWNER_EMAIL and DAN_E2E_OWNER_PASSWORD, and the shop's
 * staff API in the cloud, DAN_E2E_CLOUD_URL) on a real shop server and a real
 * cloud at once, each following the other.
 */
const server = process.env.DAN_E2E_SERVER_URL;
const cloud = process.env.DAN_E2E_CLOUD_URL;
const pin = process.env.DAN_E2E_PIN ?? "";
const ownerEmail = process.env.DAN_E2E_OWNER_EMAIL ?? "";
const ownerPassword = process.env.DAN_E2E_OWNER_PASSWORD ?? "";

/** Signs in to a Dan server by its address: the shop's own, or its staff API in the cloud. */
async function signIn(page: Page, address: string, who: "owner" | "pin") {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/connect");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.getByLabel("Shop server").fill(address);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  if (who === "owner") {
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Password").fill(ownerPassword);
  } else {
    await page.getByRole("button", { name: "PIN", exact: true }).click();
    await page.getByLabel("PIN").fill(pin);
  }
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
}

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
  await which.selectOption("all");

  // Today only (each row then says a time and no date; just after midnight there may be none), then every day again.
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByTestId("list-day")).not.toHaveValue("");
  await expect(async () => {
    const times = await rows.getByTestId("list-time").allTextContents();
    expect(times.length).toBeLessThanOrEqual(all);
    for (const time of times) expect(time.trim()).toMatch(/^\d{2}:\d{2}$/);
    if (times.length === 0) await expect(page.getByTestId("list-none")).toBeVisible();
  }).toPass();
  await page.getByRole("button", { name: "All days" }).click();
  await expect(rows).toHaveCount(all);
  // Some of the demo's orders are from earlier days: those rows say the date too.
  expect((await rows.getByTestId("list-time").allTextContents()).some((time) => time.includes(","))).toBe(true);

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

test("the owner changes an order: details and dishes, what was paid, the record, and a move back", async ({ page }) => {
  await openDemo(page);
  // An online order, paid by card, waiting in New.
  const fresh = page.locator("section[data-column='new'] article").first();
  await expect(fresh.getByTestId("docket-payment")).toHaveText("Paid by card");
  await expect(fresh.getByTestId("docket-changed")).toHaveCount(0);
  const number = (await fresh.getByTestId("docket-number").textContent())!.trim();
  await fresh.getByTestId("docket-edit").click();
  await expect(page).toHaveURL(/\/shop\/orders\/[^/]+$/);
  await expect(page.getByRole("heading", { name: `Order ${number}` })).toBeVisible();
  // (Pages visited before can stay in the document, hidden: everything here is looked for on the page in view.)
  const screen = page.getByTestId("order-screen").filter({ visible: true });
  await expect(screen.getByTestId("order-record").getByTestId("record-none")).toBeVisible();

  const editor = screen.getByTestId("order-editor");
  const save = editor.getByRole("button", { name: "Save changes" });
  const lines = editor.getByTestId("edit-line");
  await expect(save).toBeDisabled();
  await expect(lines).toHaveCount(3);
  const billBefore = (await editor.getByTestId("edit-total").textContent())!.trim();

  // Every dish off: an order needs one. Undo puts the form back.
  for (let left = 3; left > 0; left -= 1) await lines.first().getByRole("button", { name: "Remove" }).click();
  await save.click();
  await expect(editor.getByTestId("edit-status")).toHaveText("An order needs at least one dish.");
  await editor.getByRole("button", { name: "Undo" }).click();
  await expect(lines).toHaveCount(3);
  await expect(save).toBeDisabled();

  // The name, one dish off, another egg fried rice on.
  await editor.locator('input[name="edit-name"]').fill("Tom B.");
  await editor.locator('[data-testid="edit-line"][data-number="42"]').getByRole("button", { name: "Remove" }).click();
  await editor.getByTestId("edit-add-search").fill("81");
  await editor.getByTestId("edit-add-dish").first().click();
  await expect(editor.locator('[data-testid="edit-line"][data-number="81"]').getByTestId("edit-qty")).toHaveText("2");
  // The bill as it will be, and what that means for a card already charged.
  await expect(editor.getByTestId("edit-total")).toHaveText(`${billBefore}£12.00`);
  await expect(editor.getByTestId("paid-difference")).toHaveText(`Paid by card: ${billBefore}. Bill is now £12.00. £4.20 to refund.`);
  await save.click();
  await expect(editor.getByTestId("edit-status")).toHaveText("Saved. The change is in the record below.");
  await expect(save).toBeDisabled();

  // The docket says it was changed, and what was taken; the record says who, when and what.
  const docket = screen.locator("article").first();
  await expect(docket.getByTestId("docket-changed")).toHaveText("Changed");
  await expect(docket.getByTestId("paid-difference")).toContainText("£4.20 to refund");
  await expect(docket).toContainText("Tom B.");
  const record = screen.getByTestId("order-record").getByTestId("record-entry");
  await expect(record).toHaveCount(1);
  await expect(record.first()).toContainText("Mei");
  await expect(record.first()).toContainText("Name: Tom Bradley → Tom B.");
  await expect(record.first()).toContainText("−1 × 42 Crispy chilli beef (none now)");
  await expect(record.first()).toContainText("+1 × 81 Egg fried rice (now 2)");
  await expect(record.first()).toContainText(`Bill: ${billBefore} → £12.00`);

  // Back to what was paid: nothing to collect or refund.
  await editor.getByTestId("edit-add-search").fill("spring");
  await editor.getByTestId("edit-add-dish").first().click();
  await expect(editor.getByTestId("edit-total")).toContainText(billBefore);
  await expect(editor.getByTestId("paid-difference")).toHaveCount(0);
  await editor.getByRole("button", { name: "Undo" }).click();

  // The owner finishes it from here, then takes it back to Ready.
  const move = screen.getByTestId("order-move");
  await expect(move.getByRole("button", { name: "Move", exact: true })).toBeDisabled();
  await move.getByTestId("move-column").selectOption("completed");
  await move.getByRole("button", { name: "Move", exact: true }).click();
  await expect(move.getByTestId("move-status")).toHaveText("Moved. It is in the record below.");
  await expect(record).toHaveCount(2);
  await expect(record.first()).toHaveText(/Moved: New → Completed/);
  await move.getByTestId("move-column").selectOption("ready");
  await move.getByRole("button", { name: "Move", exact: true }).click();
  await expect(record).toHaveCount(3);
  await expect(record.first()).toHaveText(/Moved: Completed → Ready/);
  await expect(docket.getByRole("button", { name: "Collected", exact: true })).toBeVisible();

  // On the board it is in Ready, marked, with the difference; the record is still there after a reload.
  await screen.getByRole("link", { name: "← Back to orders" }).click();
  const onBoard = page.locator("section[data-column='ready'] article").filter({ visible: true }).filter({ has: page.getByTestId("docket-changed") });
  await expect(onBoard).toHaveCount(1);
  await expect(onBoard.getByTestId("docket-number")).toContainText(number);
  await expect(onBoard.getByTestId("paid-difference")).toBeVisible();
  await onBoard.getByTestId("docket-edit").click();
  await expect(page).toHaveURL(/\/shop\/orders\/[^/]+$/);
  await page.reload();
  await expect(record).toHaveCount(3);

  // A cancelled order is final: its page shows it, and offers no change.
  await screen.getByRole("link", { name: "← Back to orders" }).click();
  await page.locator("section[data-column='preparing'] article").filter({ visible: true }).filter({ hasText: "#1854" }).getByTestId("docket-edit").click();
  await screen.getByTestId("cancel-start").click();
  await screen.getByTestId("cancel-confirm").click();
  await expect(screen.getByTestId("order-cancelled-note")).toBeVisible();
  await screen.getByRole("link", { name: "← Back to orders" }).click();
  await page.getByTestId("orders-layout-list").filter({ visible: true }).click();
  await page.getByTestId("list-which").selectOption("cancelled");
  const cancelled = page.getByTestId("list-row");
  await expect(cancelled).toHaveCount(1);
  const id = await cancelled.getAttribute("data-order");
  await cancelled.getByRole("button").first().click();
  await expect(cancelled.getByTestId("docket-edit")).toHaveCount(0);
  await page.goto(`/shop/orders/${id}`);
  await expect(screen.getByTestId("order-cancelled-note")).toHaveText("A cancelled order cannot be changed.");
  await expect(screen.getByTestId("order-editor")).toHaveCount(0);
  await expect(screen.getByTestId("order-move")).toHaveCount(0);
  // An address that is no order says so.
  await page.goto("/shop/orders/no-such-order");
  await expect(page.getByTestId("order-missing")).toHaveText("That order is not here.");
});

test("the owner cancels any order from its page: the refund is said first, a card gets back what was taken, and it is on record", async ({ page }) => {
  await openDemo(page);
  const screen = page.getByTestId("order-screen").filter({ visible: true });
  const board = (column: string) => page.locator(`section[data-column='${column}'] article`).filter({ visible: true });

  // An online order paid by card. Its bill is changed first, so what was taken and the bill differ.
  const paid = board("new").first();
  const number = (await paid.getByTestId("docket-number").textContent())!.trim();
  const taken = (await paid.locator("p.font-display.text-xl").first().textContent())!.trim().split(/\s/)[0];
  await paid.getByTestId("docket-edit").click();
  const editor = screen.getByTestId("order-editor");
  await editor.locator('[data-testid="edit-line"][data-number="42"]').getByRole("button", { name: "Remove" }).click();
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor.getByTestId("edit-status")).toContainText("Saved.");

  // What a cancel will do is said before anything happens: the card gets back what was taken.
  const cancel = screen.getByTestId("order-cancel");
  await expect(cancel.getByTestId("cancel-plan")).toHaveAttribute("data-refund", "card");
  await expect(cancel.getByTestId("cancel-plan")).toContainText(`${taken} will be refunded to the customer's card, in full.`);
  await expect(cancel.getByTestId("cancel-plan")).toContainText("The kitchen's printers print a ticket marked CANCELLED.");
  await expect(cancel.getByTestId("cancel-confirm")).toHaveCount(0);
  await cancel.getByTestId("cancel-start").click();
  await expect(cancel.getByTestId("cancel-confirm")).toHaveText(`Yes, cancel ${number} and refund ${taken}`);
  // Second thoughts: nothing happened.
  await cancel.getByRole("button", { name: "Keep the order" }).click();
  await expect(cancel.getByTestId("cancel-start")).toBeVisible();
  await expect(screen.getByTestId("order-cancelled-note")).toHaveCount(0);
  await cancel.getByTestId("cancel-start").click();
  await cancel.getByTestId("cancel-confirm").click();

  // Final: no more changes, the refund said (the demo refunds at once), and the cancel on record.
  await expect(screen.getByTestId("order-cancelled-note")).toHaveText("A cancelled order cannot be changed.");
  await expect(screen.getByTestId("refund-note")).toHaveAttribute("data-refund", "refunded");
  await expect(screen.getByTestId("refund-note")).toHaveText(`${taken} refunded to the card.`);
  await expect(screen.getByTestId("order-editor")).toHaveCount(0);
  await expect(screen.getByTestId("order-move")).toHaveCount(0);
  await expect(screen.getByTestId("order-cancel")).toHaveCount(0);
  const record = screen.getByTestId("order-record").getByTestId("record-entry");
  await expect(record).toHaveCount(2);
  await expect(record.first()).toHaveAttribute("data-kind", "cancel");
  await expect(record.first()).toContainText("Cancelled (it was in New)");
  await expect(record.first()).toContainText(`Card refund asked for: ${taken}`);

  // It has left the board. In the list it is there, struck through, with the refund.
  await screen.getByRole("link", { name: "← Back to orders" }).click();
  await expect(board("new")).toHaveCount(0);
  await page.getByTestId("orders-layout-list").filter({ visible: true }).click();
  await page.getByTestId("list-search").fill(number);
  const row = page.getByTestId("list-row");
  await expect(row).toHaveCount(1);
  await expect(row).toHaveAttribute("data-status", "cancelled");
  await expect(row.getByTestId("list-where")).toHaveText("Cancelled");
  await row.getByRole("button").first().click();
  await expect(row.getByTestId("refund-note")).toHaveText(`${taken} refunded to the card.`);
  await page.getByTestId("list-search").fill("");
  await page.getByTestId("orders-layout-board").click();

  // A collected order can be cancelled too. Nothing was paid online; the kitchen has nothing to stop.
  const done = board("completed").first();
  const doneNumber = (await done.getByTestId("docket-number").textContent())!.trim();
  await done.getByTestId("docket-edit").click();
  await expect(screen.getByRole("heading", { name: `Order ${doneNumber}` })).toBeVisible();
  await expect(cancel.getByTestId("cancel-plan")).toHaveAttribute("data-refund", "none");
  await expect(cancel.getByTestId("cancel-plan")).toContainText("Nothing was paid online, so there is nothing to refund.");
  await expect(cancel.getByTestId("cancel-plan")).not.toContainText("CANCELLED");
  await cancel.getByTestId("cancel-start").click();
  await expect(cancel.getByTestId("cancel-confirm")).toHaveText(`Yes, cancel ${doneNumber}`);
  await cancel.getByTestId("cancel-confirm").click();
  await expect(screen.getByTestId("order-cancelled-note")).toBeVisible();
  await expect(screen.getByTestId("refund-note")).toHaveCount(0);
  await expect(screen.getByTestId("order-record").getByTestId("record-entry").first()).toContainText("Cancelled (it was in Completed)");
});

test("the owner's change on the shop server reaches the cloud with its record, a move back in the cloud reaches the shop, a cancel reaches everyone, and the PIN changes nothing", async ({ browser }) => {
  test.skip(!server || !cloud || !pin || !ownerEmail, "Set the shop server, the cloud's staff API, the PIN and the owner's sign-in to run this.");
  test.setTimeout(120_000);
  const atShop = await (await browser.newContext()).newPage();
  const inCloud = await (await browser.newContext()).newPage();
  const counter = await (await browser.newContext()).newPage();
  await signIn(atShop, server!, "owner");

  // A phone order, taken on the shop's own server.
  const name = `Edit ${Date.now().toString(36)}`;
  await atShop.getByTestId("create-order").click();
  await atShop.getByTestId("menu-picker-search").fill("81");
  await atShop.getByTestId("menu-picker-dish").first().click();
  const slip = atShop.getByTestId("order-slip");
  await slip.getByRole("button", { name: "Phone", exact: true }).click();
  await slip.getByLabel("Name").fill(name);
  await slip.getByRole("button", { name: "Send to kitchen" }).click();
  await expect(atShop.getByTestId("order-sent")).toContainText("Sent to the kitchen #");
  const number = (await atShop.getByTestId("order-sent").textContent())!.match(/#(\d+)/)![1];

  // The owner adds a dish and a note.
  await atShop.getByRole("link", { name: "← Back to orders" }).click();
  const docket = atShop.locator("article").filter({ hasText: name });
  await docket.getByTestId("docket-edit").click();
  const editor = atShop.getByTestId("order-editor");
  await editor.locator('input[name="edit-notes"]').fill("No onions");
  await editor.getByTestId("edit-add-search").fill("prawn toast");
  await editor.getByTestId("edit-add-dish").first().click();
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor.getByTestId("edit-status")).toHaveText("Saved. The change is in the record below.");
  const shopRecord = atShop.getByTestId("order-record").getByTestId("record-entry");
  await expect(shopRecord).toHaveCount(1);
  await expect(shopRecord).toContainText("+1 × 3 Prawn toast (now 1)");
  const orderUrl = new URL(atShop.url()).pathname;

  // The counter PIN sees that it was changed, and can change nothing.
  await signIn(counter, server!, "pin");
  const theirs = counter.locator("article").filter({ hasText: name });
  await expect(theirs.getByTestId("docket-changed")).toHaveText("Changed");
  await expect(theirs.getByTestId("docket-edit")).toHaveCount(0);
  await counter.goto(orderUrl);
  await expect(counter.getByTestId("order-owner-only")).toHaveText("Only the owner can change an order.");
  await expect(counter.getByTestId("order-editor")).toHaveCount(0);
  await expect(counter.getByTestId("order-move")).toHaveCount(0);
  await expect(counter.getByTestId("order-cancel")).toHaveCount(0);
  await expect(counter.getByTestId("order-record")).toHaveCount(0);

  // In the cloud, a moment later: the order as changed, and its record.
  await signIn(inCloud, cloud!, "owner");
  await inCloud.getByTestId("orders-layout-list").click();
  await inCloud.getByTestId("list-search").fill(name);
  const row = inCloud.getByTestId("list-row");
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  await expect(row.getByTestId("list-number")).toHaveText(`#${number}`);
  await row.getByRole("button").first().click();
  await expect(row.getByTestId("docket-changed")).toBeVisible({ timeout: 15_000 });
  await row.getByTestId("docket-edit").click();
  const cloudRecord = inCloud.getByTestId("order-record").getByTestId("record-entry");
  await expect(cloudRecord).toHaveCount(1, { timeout: 15_000 });
  await expect(cloudRecord).toContainText("Note: (empty) → No onions");

  // The shop finishes the order; the owner, in the cloud, takes it back to New.
  await atShop.getByRole("link", { name: "← Back to orders" }).click();
  const moving = atShop.locator("article").filter({ hasText: name });
  await moving.getByRole("button", { name: "Ready", exact: true }).click();
  await atShop.waitForTimeout(1500);
  await moving.getByRole("button", { name: "Collected", exact: true }).click();
  await expect(atShop.locator("section[data-column='completed'] article").filter({ hasText: name })).toBeVisible();
  const move = inCloud.getByTestId("order-move");
  await expect(move.getByTestId("move-column")).toHaveValue("completed", { timeout: 15_000 });
  await move.getByTestId("move-column").selectOption("new");
  await move.getByRole("button", { name: "Move", exact: true }).click();
  await expect(move.getByTestId("move-status")).toHaveText("Moved. It is in the record below.");
  await expect(cloudRecord).toHaveCount(2);

  // The shop's tablets follow, with no reload; the record is on the shop server too.
  await expect(atShop.locator("section[data-column='new'] article").filter({ hasText: name })).toBeVisible({ timeout: 20_000 });
  await atShop.goto(orderUrl);
  await expect(shopRecord).toHaveCount(2, { timeout: 15_000 });
  await expect(shopRecord.first()).toHaveText(/Moved: Completed → New/);
  // And it carries on from there as ever.
  await atShop.getByTestId("order-screen").locator("article").first().getByRole("button", { name: "Accept", exact: true }).click();
  await expect(inCloud.getByTestId("order-move").getByTestId("move-column")).toHaveValue("preparing", { timeout: 20_000 });

  // The owner cancels it, on the shop server: it leaves the counter's board with no reload,
  // and in the cloud it is cancelled, with the cancel on record.
  // (On the board itself: the order's own page, visited above, can stay in the document, hidden.)
  await counter.getByRole("link", { name: /^Orders/ }).first().click();
  const onCounter = counter.locator("section[data-column] article").filter({ hasText: name });
  await expect(onCounter).toBeVisible({ timeout: 15_000 });
  const cancel = atShop.getByTestId("order-cancel");
  await expect(cancel.getByTestId("cancel-plan")).toHaveAttribute("data-refund", "none");
  await cancel.getByTestId("cancel-start").click();
  await cancel.getByTestId("cancel-confirm").click();
  await expect(atShop.getByTestId("order-cancelled-note")).toBeVisible();
  await expect(shopRecord).toHaveCount(3);
  await expect(shopRecord.first()).toContainText("Cancelled (it was in Preparing)");
  await expect(onCounter).toHaveCount(0, { timeout: 15_000 });
  await expect(inCloud.getByTestId("order-cancelled-note")).toBeVisible({ timeout: 20_000 });
  await expect(cloudRecord).toHaveCount(3, { timeout: 15_000 });
  await expect(inCloud.getByTestId("order-cancel")).toHaveCount(0);
});
