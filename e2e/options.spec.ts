import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Dish options and add-ons. In the demo: the owner gives a dish its options
 * and the shop its add-ons on the Menu page; staff take an order with them
 * (the chooser, the slip, the bill's add-ons); the ticket and the board show
 * what was chosen; and the owner changes the bill's add-ons afterwards, on
 * the order's page, where it is recorded.
 *
 * Then, with a real shop server (DAN_E2E_SERVER_URL, the owner's sign-in and
 * DAN_E2E_PIN): the owner sets them up there, the counter PIN takes an order,
 * and the bill the dashboard showed is the bill the server made.
 */
const server = process.env.DAN_E2E_SERVER_URL;
const pin = process.env.DAN_E2E_PIN ?? "";
const ownerEmail = process.env.DAN_E2E_OWNER_EMAIL ?? "";
const ownerPassword = process.env.DAN_E2E_OWNER_PASSWORD ?? "";

async function openDemo(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/shop/orders?demo=1");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
}

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

const nav = (page: Page, name: RegExp) => page.getByRole("link", { name }).first().click();

/** The README's pictures of these screens, taken in the demo only. */
let shots = false;
const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: `docs/screenshots/${name}.png` });
};

/** Gives the egg fried rice (81) two sizes, the second dearer. `suffix` keeps names apart between runs on a real server. */
async function giveRiceSizes(page: Page) {
  await nav(page, /^Menu/);
  await expect(page.getByRole("heading", { name: "Menu", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Rice/ }).click();
  await page.getByRole("button", { name: /Egg fried rice/ }).first().click();
  const form = page.getByTestId("dish-form");
  await expect(form).toBeVisible();
  // Start from no options, whatever an earlier run left.
  while ((await form.getByTestId("option-remove-group").count()) > 0) await form.getByTestId("option-remove-group").first().click();
  await form.getByTestId("option-add-group").click();
  const group = form.getByTestId("option-group");
  await group.locator('input[name="option-group-name"]').fill("Size");
  await group.locator('input[name="option-group-name-zh"]').fill("份量");
  await group.locator('input[name="option-choice-name"]').first().fill("Regular");
  await group.getByTestId("option-add-choice").click();
  await group.locator('input[name="option-choice-name"]').nth(1).fill("Large");
  await group.locator('input[name="option-choice-price"]').nth(1).fill("1.50");
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("menu-notice")).toHaveText("Saved.");
  await expect(page.getByTestId("dish-options").filter({ hasText: "Size" })).toBeVisible();
}

async function addAddon(section: Locator, set: { name: string; scope?: "dish"; kind?: "percent"; minus?: boolean; amount: string; required?: boolean; auto?: boolean; channels?: "online" | "local" }) {
  await section.getByTestId("addons-add").click();
  const row = section.getByTestId("addon-row").last();
  await row.locator('input[name="addon-name"]').fill(set.name);
  if (set.scope) await row.locator('select[name="addon-scope"]').selectOption(set.scope);
  if (set.kind) await row.locator('select[name="addon-kind"]').selectOption(set.kind);
  if (set.minus) await row.locator('select[name="addon-direction"]').selectOption("minus");
  await row.locator('input[name="addon-amount"]').fill(set.amount);
  if (set.auto) await row.locator('input[name="addon-auto"]').check();
  if (set.required) await row.locator('input[name="addon-required"]').check();
  if (set.channels) await row.locator('select[name="addon-channels"]').selectOption(set.channels);
}

/** The shop's add-ons, from nothing: a required service charge, a bag to tick, an online-only offer, and a sauce for a dish. */
async function setAddons(page: Page) {
  const section = page.getByTestId("addons-section").filter({ visible: true });
  await section.scrollIntoViewIfNeeded();
  while ((await section.getByTestId("addon-row").count()) > 0) await section.getByRole("button", { name: /^Remove:/ }).first().click();
  await addAddon(section, { name: "Service charge", kind: "percent", amount: "10", required: true });
  await addAddon(section, { name: "Carrier bag", amount: "0.10" });
  await addAddon(section, { name: "Web offer", kind: "percent", minus: true, amount: "5", auto: true, channels: "online" });
  await addAddon(section, { name: "Extra sauce", scope: "dish", amount: "0.50" });
  // The amounts as an order will show them, before anything is saved.
  await expect(section.getByTestId("addon-amount-shown")).toHaveText(["+10%", "+£0.10", "-5%", "+£0.50"]);
  // Required is ticked by default too.
  await expect(section.getByTestId("addon-row").first().locator('input[name="addon-auto"]')).toBeChecked();
  await section.getByTestId("addons-save").click();
  await expect(section.getByTestId("addons-status")).toHaveText("Saved.");
  await section.getByTestId("addon-row").first().scrollIntoViewIfNeeded();
  await shot(page, "addons");
}

/**
 * Takes an order from the menu: two large rice with extra sauce (chosen in
 * the chooser), one duck (no options: straight on the slip), and a bag.
 * Returns the bill the slip showed.
 */
async function takeOrder(page: Page): Promise<string> {
  await nav(page, /^Orders/);
  await page.getByTestId("create-order").filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Create order" })).toBeVisible();
  await page.getByTestId("create-mode-menu").filter({ visible: true }).click();
  const picker = page.getByTestId("menu-picker").filter({ visible: true });
  const slip = page.getByTestId("order-slip").filter({ visible: true });
  await picker.getByTestId("menu-picker-search").fill("81");
  await picker.locator('[data-testid="menu-picker-dish"][data-number="81"]').click();
  // A dish with options is chosen before it goes on the slip.
  const chooser = page.getByTestId("dish-chooser");
  await expect(chooser).toBeVisible();
  await expect(chooser.locator('[data-choice="regular"]')).toBeChecked();
  await expect(chooser.getByTestId("chooser-confirm")).toContainText("£3.90");
  await chooser.locator('[data-choice="large"]').check();
  await chooser.locator('[data-addon="extra-sauce"]').check();
  await chooser.getByRole("button", { name: "+", exact: true }).click();
  await expect(chooser.getByTestId("chooser-qty")).toHaveText("2");
  // 2 x (3.90 + 1.50) + 2 x 0.50.
  await expect(chooser.getByTestId("chooser-confirm")).toContainText("£11.80");
  await shot(page, "options");
  await chooser.getByTestId("chooser-confirm").click();
  await expect(chooser).toBeHidden();
  const rice = slip.locator('[data-testid="slip-line"][data-number="81"]');
  await expect(rice.getByTestId("line-details")).toHaveText("Large · + Extra sauce");
  await expect(rice.getByTestId("slip-line-total")).toHaveText("£11.80");

  // A dish without options goes straight on, and can be dressed afterwards.
  await picker.getByTestId("menu-picker-search").fill("1");
  await picker.locator('[data-testid="menu-picker-dish"][data-number="1"]').click();
  await expect(chooser).toBeHidden();
  const duck = slip.locator('[data-testid="slip-line"][data-number="1"]');
  await expect(duck.getByTestId("slip-line-total")).toHaveText("£11.80");
  await expect(duck.getByTestId("line-details")).toHaveCount(0);

  // The bill's add-ons: the required one is on and cannot be taken off; the online-only one is not offered here.
  const addons = slip.getByTestId("slip-addons");
  await expect(addons.getByTestId("slip-addon")).toHaveCount(2);
  await expect(addons.locator('[data-addon="service-charge"]')).toBeChecked();
  await expect(addons.locator('[data-addon="service-charge"]')).toBeDisabled();
  await expect(addons.locator('[data-addon="carrier-bag"]')).not.toBeChecked();
  await expect(slip.getByTestId("slip-total")).toHaveText("£25.96");
  await addons.locator('[data-addon="carrier-bag"]').check();
  await expect(addons.getByTestId("slip-addon-amount")).toHaveText(["£2.36", "£0.10"]);
  await expect(slip.getByTestId("slip-total")).toHaveText("£26.06");
  await picker.getByTestId("menu-picker-search").fill("");
  await shot(page, "addons-slip");
  await slip.getByRole("button", { name: /Send to kitchen|Place order/ }).click();
  await expect(page.getByTestId("order-sent").filter({ visible: true })).toBeVisible();
  return "£26.06";
}

test("options and add-ons: set up by the owner, chosen at the counter, shown on the ticket, changed afterwards and recorded", async ({ page }) => {
  await openDemo(page);
  shots = true;
  await giveRiceSizes(page);
  await setAddons(page);
  const bill = await takeOrder(page);
  shots = false;

  // The ticket: what was chosen under the dish, and the bill's add-ons above the total.
  const sent = page.getByTestId("order-sent").filter({ visible: true });
  const href = await sent.getByRole("link", { name: "View ticket" }).getAttribute("href");
  const id = new URL(href!, "http://x").searchParams.get("order")!;
  await sent.getByRole("link", { name: "View ticket" }).click();
  const ticket = page.getByTestId("ticket-slip").filter({ visible: true }).first();
  await expect(ticket.getByTestId("ticket-detail")).toHaveText(["- Large", "- + Extra sauce"]);
  await expect(ticket.getByTestId("ticket-addon")).toHaveText(["Service charge 10%£2.36", "Carrier bag£0.10"]);
  await expect(ticket).toContainText(bill);

  // The board's docket says how the dish is taken.
  await nav(page, /^Orders/);
  const docket = page.locator(`[data-order-id="${id}"]`).filter({ visible: true }).first();
  await expect(docket.getByTestId("line-details")).toHaveText("Large · + Extra sauce");

  // Afterwards only the owner changes the bill's add-ons: the required charge comes off, and it is recorded.
  await page.goto(`/shop/orders/${id}`);
  const editor = page.getByTestId("order-editor").filter({ visible: true });
  await expect(editor.locator('[data-testid="edit-line"][data-number="81"]').getByTestId("line-details")).toHaveText("Large · + Extra sauce");
  const onBill = editor.getByTestId("edit-addons");
  await expect(onBill.locator('[data-addon="service-charge"]')).toBeChecked();
  await expect(onBill.locator('[data-addon="carrier-bag"]')).toBeChecked();
  await onBill.locator('[data-addon="service-charge"]').uncheck();
  await expect(editor.getByTestId("edit-total")).toContainText("£23.70");
  // Another rice, the regular one: chosen by the owner, priced from the menu.
  await editor.getByTestId("edit-add-search").fill("81");
  await editor.locator('[data-testid="edit-add-dish"][data-number="81"]').click();
  const chooser = page.getByTestId("dish-chooser");
  await expect(chooser).toBeVisible();
  await chooser.getByTestId("chooser-confirm").click();
  await expect(editor.getByTestId("edit-line")).toHaveCount(3);
  await expect(editor.getByTestId("edit-line").last().getByTestId("line-details")).toHaveText("Regular");
  await expect(editor.getByTestId("edit-total")).toContainText("£27.60");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByTestId("edit-status").filter({ visible: true })).toContainText("Saved.");
  const record = page.getByTestId("record-entry").filter({ visible: true }).first();
  await expect(record).toContainText("Add-ons on the bill: Service charge, Carrier bag → Carrier bag");
  await expect(record.getByTestId("record-detail")).toHaveText("(Regular)");
  await expect(record).toContainText("£26.06 → £27.60");
});

test("the till's keypad asks how a dish with options is taken, and the slip lets it be changed", async ({ page }) => {
  await openDemo(page);
  await giveRiceSizes(page);
  await setAddons(page);
  await nav(page, /^Orders/);
  await page.getByTestId("create-order").filter({ visible: true }).click();
  await page.getByTestId("create-mode-till").filter({ visible: true }).click();
  await expect(page.getByTestId("till-keypad").filter({ visible: true })).toBeVisible();
  // 2 x 81, keyed: the chooser opens with two.
  await page.keyboard.type("2*81");
  await page.keyboard.press("Enter");
  const chooser = page.getByTestId("dish-chooser");
  await expect(chooser).toBeVisible();
  await expect(chooser.getByTestId("chooser-qty")).toHaveText("2");
  // While it is open the keys are not the keypad's.
  await page.keyboard.type("9");
  await chooser.getByTestId("chooser-confirm").click();
  const slip = page.getByTestId("order-slip").filter({ visible: true });
  const line = slip.getByTestId("slip-line");
  await expect(line).toHaveCount(1);
  await expect(line.getByTestId("slip-qty")).toHaveText("2");
  await expect(line.getByTestId("line-details")).toHaveText("Regular");
  await expect(line.getByTestId("slip-line-total")).toHaveText("£7.80");

  // Changed on the slip: large, with the sauce. Still one line.
  await line.getByTestId("slip-change").click();
  await expect(chooser.locator('[data-choice="regular"]')).toBeChecked();
  await chooser.locator('[data-choice="large"]').check();
  await chooser.locator('[data-addon="extra-sauce"]').check();
  await expect(chooser.getByTestId("chooser-confirm")).toContainText("Update");
  await chooser.getByTestId("chooser-confirm").click();
  await expect(line).toHaveCount(1);
  await expect(line.getByTestId("line-details")).toHaveText("Large · + Extra sauce");
  await expect(line.getByTestId("slip-line-total")).toHaveText("£11.80");
  // The same dish the plain way is another line.
  await page.keyboard.type("81");
  await page.keyboard.press("Enter");
  await chooser.getByTestId("chooser-confirm").click();
  await expect(line).toHaveCount(2);
  // 11.80 + 3.90, and 10% service.
  await expect(slip.getByTestId("slip-total")).toHaveText("£17.27");
});

test("on a real shop server: the bill the counter saw is the bill the server made", async ({ page }) => {
  test.skip(!server || !ownerEmail || !pin, "needs DAN_E2E_SERVER_URL, the owner's sign-in and DAN_E2E_PIN");
  // Three sign-ins and every save goes to the server.
  test.setTimeout(120_000);
  await signIn(page, server!, "owner");
  await giveRiceSizes(page);
  await setAddons(page);

  // The counter PIN reads the add-ons and cannot change them.
  await signIn(page, server!, "pin");
  await nav(page, /^Menu/);
  const section = page.getByTestId("addons-section").filter({ visible: true });
  await expect(section.getByTestId("addons-owner-only")).toBeVisible();
  await expect(section.getByTestId("addon-row")).toHaveCount(4);
  await expect(section.getByTestId("addons-save")).toHaveCount(0);
  await expect(section.locator('input[name="addon-name"]').first()).toBeDisabled();

  const bill = await takeOrder(page);
  const sent = page.getByTestId("order-sent").filter({ visible: true });
  await sent.getByRole("link", { name: "View ticket" }).click();
  const ticket = page.getByTestId("ticket-slip").filter({ visible: true }).first();
  // These figures are the server's own: the order as it came back.
  await expect(ticket.getByTestId("ticket-addon")).toHaveText(["Service charge 10%£2.36", "Carrier bag£0.10"]);
  await expect(ticket.getByTestId("ticket-detail")).toHaveText(["- Large", "- + Extra sauce"]);
  await expect(ticket).toContainText(bill);

  // Left as it was found, so the other tests meet a shop with no options and no add-ons.
  await signIn(page, server!, "owner");
  await nav(page, /^Menu/);
  const owners = page.getByTestId("addons-section").filter({ visible: true });
  await expect(owners.getByTestId("addon-row")).toHaveCount(4);
  while ((await owners.getByTestId("addon-row").count()) > 0) await owners.getByRole("button", { name: /^Remove:/ }).first().click();
  await owners.getByTestId("addons-save").click();
  await expect(owners.getByTestId("addons-status")).toHaveText("Saved.");
  await page.getByRole("button", { name: /^Rice/ }).click();
  await page.getByRole("button", { name: /Egg fried rice/ }).first().click();
  const form = page.getByTestId("dish-form");
  await form.getByTestId("option-remove-group").click();
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("menu-notice")).toHaveText("Saved.");
  await expect(page.getByTestId("dish-options")).toHaveCount(0);
});
