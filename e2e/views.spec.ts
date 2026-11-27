import { expect, test, type Page } from "@playwright/test";
import { expectPinCannotSee, openSettings } from "./settings";
import { openTill } from "./create-order";
import { cloudOn, cloudSkip, joinNewShop } from "./cloud-join";

/**
 * Views: the owner's screens for one part of the order flow. Kitchen and Pass
 * are views. In the demo: add one, see it in the menu, lock a tablet to it,
 * give it a sound, change the board under it, remove it, reset.
 *
 * With a real shop server (DAN_E2E_SERVER_URL, DAN_E2E_PIN) the counter PIN
 * sees the views read-only. With a Dan cloud (as e2e/accounts.spec.ts needs)
 * an online shop starts with no views and a restaurant with Kitchen and Pass.
 */
const server = process.env.DAN_E2E_SERVER_URL;
const pin = process.env.DAN_E2E_PIN ?? "";

const played = (page: Page) => page.evaluate(() => ((window as unknown as { __danSounds?: { key: string; sound: string; place: string }[] }).__danSounds ?? []).slice());

async function holdLock(page: Page, ms: number) {
  const box = (await page.getByTestId("focus-unlock").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

test("in the demo, the owner adds a view, locks a tablet to it, gives it a sound, and removes it", async ({ context }) => {
  test.setTimeout(120_000);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/shop/orders?demo=1");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();

  // Kitchen and Pass are views now: where they were in the menu, on their own addresses.
  await page.getByRole("link", { name: /^Kitchen/ }).click();
  await expect(page).toHaveURL(/\/shop\/view\/kitchen$/);
  await expect(page.getByRole("heading", { name: "Kitchen" })).toBeVisible();
  const inKitchen = await page.getByTestId("kitchen-ticket").count();
  expect(inKitchen).toBeGreaterThan(1);
  // The old addresses still lead there.
  await page.goto("/shop/pass");
  await expect(page).toHaveURL(/\/shop\/view\/pass$/);
  await expect(page.getByRole("heading", { name: "Pass" })).toBeVisible();

  await openSettings(page, "flow");
  const section = page.getByTestId("views-section");
  const rows = section.getByTestId("view-row");
  await expect(rows).toHaveCount(2);
  const kitchen = section.locator('[data-view="kitchen"]');
  await expect(kitchen.getByLabel("Name: Kitchen")).toHaveValue("Kitchen");
  await expect(kitchen.getByLabel("Make: Kitchen")).toBeChecked();
  for (const column of ["New", "Preparing", "Ready"]) await expect(kitchen.getByLabel(`${column}: Kitchen`)).toBeChecked();
  await expect(kitchen.getByLabel("Completed: Kitchen")).not.toBeChecked();
  const pass = section.locator('[data-view="pass"]');
  await expect(pass.getByLabel("Hand over: Pass")).toBeChecked();
  await expect(pass.getByLabel("Ready: Pass")).toBeChecked();
  await expect(pass.getByLabel("Preparing: Pass")).not.toBeChecked();
  await expect(section.getByRole("button", { name: "Save views" })).toBeDisabled();

  // A new view needs a name. Packing shows what is being prepared, nothing else.
  await section.getByRole("button", { name: "Add view" }).click();
  await expect(rows).toHaveCount(3);
  await section.getByRole("button", { name: "Save views" }).click();
  await expect(section.getByTestId("views-status")).toContainText("needs a name");
  await rows.nth(2).getByPlaceholder("Name", { exact: true }).fill("Packing");
  await rows.nth(2).getByLabel("Preparing: Packing").check();
  await section.getByRole("button", { name: "Save views" }).click();
  await expect(section.getByTestId("views-status")).toHaveText("Saved.");
  await expect(section.locator('[data-view="packing"]')).toBeVisible();

  // It is in the menu, on its own address, with only the tickets in that column.
  await page.getByRole("link", { name: /^Packing/ }).click();
  await expect(page).toHaveURL(/\/shop\/view\/packing$/);
  await expect(page.getByRole("heading", { name: "Packing" })).toBeVisible();
  const tickets = page.getByTestId("kitchen-ticket");
  await expect(tickets.first()).toBeVisible();
  const inPacking = await tickets.count();
  expect(inPacking).toBeLessThan(inKitchen);
  for (const ticket of await tickets.all()) await expect(ticket).toHaveAttribute("data-status", "preparing");

  // A tablet can be locked to it, and unlocked by the 3 second hold.
  await page.getByTestId("focus-button").first().click();
  await page.getByTestId("focus-packing").click();
  const status = page.getByTestId("focus-status");
  await expect(status).toContainText("Focus mode on: Packing");
  await expect(page.getByRole("link", { name: /^Sales/ })).toHaveCount(0);
  await page.goto("/shop/sales");
  await expect(page).toHaveURL(/\/shop\/view\/packing$/);
  await holdLock(page, 3300);
  await expect(page).toHaveURL(/\/shop\/orders$/);
  await expect(status).toHaveCount(0);

  // A sound that plays on Packing only, when a ticket enters Preparing.
  await openSettings(page, "flow");
  const sounds = page.getByTestId("sounds-section");
  await expect(sounds.getByTestId("sound-list").locator("> li")).toHaveCount(1);
  await sounds.getByRole("button", { name: "Add a sound" }).click();
  await sounds.getByLabel("When 2").selectOption("column:preparing");
  await sounds.getByLabel("Packing 2").check();
  await sounds.getByLabel("Pass 2").uncheck();
  await expect(sounds.getByLabel("Kitchen 2")).not.toBeChecked();
  await sounds.getByRole("button", { name: "Save sounds" }).click();
  await expect(sounds.getByTestId("sounds-message")).toHaveText("Sounds saved. Every tablet follows.");

  const tablet = await context.newPage();
  await tablet.goto("/shop/view/packing");
  await tablet.getByTestId("sounds-enable").click();
  await expect(tablet.getByTestId("sounds-on")).toHaveAttribute("data-unlocked", "true");
  const kitchenTablet = await context.newPage();
  await kitchenTablet.goto("/shop/view/kitchen");
  await kitchenTablet.getByTestId("sounds-enable").click();
  await expect(kitchenTablet.getByTestId("sounds-on")).toHaveAttribute("data-unlocked", "true");

  // The counter accepts a new order: Packing hears the chime, the kitchen does not.
  await page.getByRole("link", { name: /^Orders/ }).first().click();
  await page.locator("section[data-column='new'] article").first().getByRole("button", { name: "Accept", exact: true }).click();
  await expect(async () => {
    const heard = await played(tablet);
    expect(heard.map((entry) => entry.sound)).toEqual(["chime"]);
    expect(heard[0].place).toBe("packing");
  }).toPass({ timeout: 10_000 });
  expect(await played(kitchenTablet)).toEqual([]);
  await expect(tablet.getByTestId("kitchen-ticket")).toHaveCount(inPacking + 1);

  // The board gains a second in-progress column. Kitchen and Packing each showed the
  // whole of that stage, so they take the new column too; the pass does not.
  await openSettings(page, "flow");
  await page.getByRole("button", { name: "Add a column" }).click();
  await page.getByLabel("English name 3").fill("Boxing");
  await page.getByRole("button", { name: "Save board" }).click();
  await expect(page.getByTestId("board-message")).toHaveText("Board saved. Every tablet follows.");
  await expect(kitchen.getByLabel("Boxing: Kitchen")).toBeChecked();
  await expect(section.locator('[data-view="packing"]').getByLabel("Boxing: Packing")).toBeChecked();
  await expect(pass.getByLabel("Boxing: Pass")).not.toBeChecked();

  // Packing goes: out of the menu, and its sound with it. A tablet on it is told.
  await section.getByRole("button", { name: "Remove: Packing" }).click();
  await expect(rows).toHaveCount(2);
  await section.getByRole("button", { name: "Save views" }).click();
  await expect(section.getByTestId("views-status")).toHaveText("Saved.");
  await expect(page.getByRole("link", { name: /^Packing/ })).toHaveCount(0);
  await expect(sounds.getByTestId("sound-list").locator("> li")).toHaveCount(1);
  await expect(sounds.getByLabel("Packing 1")).toHaveCount(0);
  await expect(tablet.getByTestId("view-gone")).toBeVisible({ timeout: 10_000 });
  await expect(tablet.getByTestId("view-gone")).toContainText("This view is no longer here");

  // Kitchen renamed and narrowed, then everything back to the starting views.
  await kitchen.getByLabel("Name: Kitchen").fill("Line");
  await kitchen.getByLabel("New: Line").uncheck();
  await section.getByRole("button", { name: "Save views" }).click();
  await expect(section.getByTestId("views-status")).toHaveText("Saved.");
  await expect(page.getByRole("link", { name: /^Line/ })).toBeVisible();
  await page.reload();
  await expect(kitchen.getByLabel("Name: Line")).toHaveValue("Line");
  await expect(kitchen.getByLabel("New: Line")).not.toBeChecked();
  await section.getByTestId("views-reset").click();
  await expect(section.getByTestId("views-reset")).toHaveText("Tap again to reset");
  await section.getByTestId("views-reset").click();
  await expect(section.getByTestId("views-status")).toHaveText("Views reset.");
  await expect(kitchen.getByLabel("Name: Kitchen")).toHaveValue("Kitchen");
  await expect(kitchen.getByLabel("New: Kitchen")).toBeChecked();
  await expect(kitchen.getByLabel("Boxing: Kitchen")).toBeChecked();
  await expect(page.getByRole("link", { name: /^Kitchen/ })).toBeVisible();
});

test("the counter PIN sees the views but cannot change them", async ({ page }) => {
  test.skip(!server || !pin, "Set DAN_E2E_SERVER_URL and DAN_E2E_PIN to run against a real shop server.");
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
  // Settings shows the counter PIN Tables & printers only (RK, 27 Nov 2026); the views are the owner's.
  await expectPinCannotSee(page, "flow");
  await expect(page.getByTestId("views-section")).toHaveCount(0);
  // Anyone signed in can still open a view and lock a tablet to it.
  const view = page.locator('nav[aria-label="Dan"] a[href^="/shop/view/"]').first();
  const id = (await view.getAttribute("href"))!.replace("/shop/view/", "");
  await page.getByTestId("focus-button").first().click();
  await expect(page.getByTestId("focus-dialog").getByTestId(`focus-${id}`)).toBeVisible();
});

test("an online shop in the cloud starts with three columns and no views, and can add one", async ({ page }) => {
  test.skip(!cloudOn, cloudSkip);
  test.setTimeout(120_000);
  await joinNewShop(page, "Online shop", "views-shop");

  // No Kitchen, no Pass: staff work from the orders board.
  await expect(page.getByRole("link", { name: /^Kitchen/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Pass/ })).toHaveCount(0);
  await openSettings(page, "flow");
  await expect(page.getByTestId("board-columns").locator("> li")).toHaveCount(3);
  await expect(page.getByLabel("English name 1")).toHaveValue("New");
  await expect(page.getByLabel("English name 2")).toHaveValue("Ready");
  await expect(page.getByLabel("English name 3")).toHaveValue("Completed");
  const section = page.getByTestId("views-section");
  await expect(section.getByTestId("views-none")).toBeVisible();
  await expect(page.getByTestId("stations-section").getByTestId("stations-none")).toBeVisible();
  await expect(page.getByTestId("sounds-section").getByTestId("sound-list")).toContainText("No sounds.");
  // Focus mode offers the till and the orders board only.
  await page.getByTestId("focus-button").first().click();
  const dialog = page.getByTestId("focus-dialog");
  await expect(dialog.getByTestId("focus-board")).toBeVisible();
  await expect(dialog.getByTestId("focus-till")).toBeVisible();
  await expect(dialog.locator("button[data-testid^='focus-']")).toHaveCount(2);
  await page.keyboard.press("Escape");

  // An order goes New, Ready, Completed: two taps.
  await page.getByRole("link", { name: /^Menu/ }).click();
  await page.getByTestId("menu-tools").getByRole("button", { name: "Add category" }).click();
  await page.getByTestId("category-new").getByLabel("Name", { exact: true }).fill("Candles");
  await page.getByTestId("category-new").getByRole("button", { name: "Add category" }).click();
  await expect(page.getByTestId("category-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Add dish" }).click();
  const dish = page.getByTestId("dish-form");
  await dish.locator('input[name="dish-name"]').fill("Beeswax candle");
  await dish.locator('input[name="dish-price"]').fill("6");
  await dish.getByRole("button", { name: "Add to menu" }).click();
  await expect(page.getByTestId("menu-notice")).toHaveText("Added.");
  await openTill(page);
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText(/Order placed/)).toBeVisible();
  await page.getByRole("link", { name: /^Orders/ }).first().click();
  const fresh = page.locator("section[data-column='new'] article");
  await expect(fresh).toHaveCount(1);
  await fresh.getByRole("button", { name: "Accept", exact: true }).click();
  const ready = page.locator("section[data-column='ready'] article");
  await expect(ready).toHaveCount(1);
  await expect(fresh).toHaveCount(0);

  // The owner adds a packing bench for what is ready to hand over.
  await openSettings(page, "flow");
  await section.getByRole("button", { name: "Add view" }).click();
  const row = section.getByTestId("view-row").first();
  await row.getByPlaceholder("Name", { exact: true }).fill("Packing bench");
  await row.getByLabel("Hand over: Packing bench").check();
  await row.getByLabel("Ready: Packing bench").check();
  await section.getByRole("button", { name: "Save views" }).click();
  await expect(section.getByTestId("views-status")).toHaveText("Saved.");
  await page.getByRole("link", { name: /^Packing bench/ }).click();
  await expect(page).toHaveURL(/\/shop\/view\/packing-bench$/);
  const waiting = page.getByTestId("pass-ticket");
  await expect(waiting).toHaveCount(1);
  await expect(waiting).toContainText("Beeswax candle");
  await waiting.getByRole("button", { name: "Collected" }).click();
  await expect(waiting).toHaveCount(0);

  // Reset takes an online shop back to no views, not to Kitchen and Pass.
  await openSettings(page, "flow");
  await section.getByTestId("views-reset").click();
  await section.getByTestId("views-reset").click();
  await expect(section.getByTestId("views-status")).toHaveText("Views reset.");
  await expect(section.getByTestId("views-none")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Packing bench/ })).toHaveCount(0);
});

test("a restaurant in the cloud starts with Kitchen and Pass", async ({ page }) => {
  test.skip(!cloudOn, cloudSkip);
  test.setTimeout(120_000);
  await joinNewShop(page, "Restaurant", "views-restaurant");
  await expect(page.getByRole("link", { name: /^Kitchen/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Pass/ })).toBeVisible();
  await openSettings(page, "flow");
  await expect(page.getByTestId("board-columns").locator("> li")).toHaveCount(4);
  const section = page.getByTestId("views-section");
  await expect(section.getByTestId("view-row")).toHaveCount(2);
  await expect(section.locator('[data-view="kitchen"]').getByLabel("Preparing: Kitchen")).toBeChecked();
  await expect(section.locator('[data-view="pass"]').getByLabel("Ready: Pass")).toBeChecked();
  await expect(page.getByTestId("stations-section").getByTestId("station-row")).toHaveCount(4);
  await expect(page.getByTestId("sounds-section").getByTestId("sound-list").locator("> li")).toHaveCount(1);
  await expect(page.getByTestId("sounds-section").getByLabel("Kitchen 1")).toBeChecked();
});
