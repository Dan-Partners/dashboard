import { expect, test, type Page } from "@playwright/test";
import { expectPinCannotSee, openSettings } from "./settings";
import { openTill } from "./create-order";
import { cloudOn, cloudSkip, joinNewShop } from "./cloud-join";

/**
 * Owner-named stations. In the demo: add one, move a dish to it, see it on the
 * kitchen screen and the slip, rename one, and find that a station dishes use
 * cannot be removed.
 *
 * With a real shop server (DAN_E2E_SERVER_URL, DAN_E2E_PIN) the counter PIN
 * sees the list read-only. With a Dan cloud (as e2e/accounts.spec.ts needs) a
 * new restaurant removes every station and works without them.
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

test("in the demo, the owner adds a station, moves a dish to it and renames another", async ({ page }) => {
  await openDemo(page);
  await openSettings(page, "flow");
  const section = page.getByTestId("stations-section");
  const rows = section.getByTestId("station-row");
  await expect(rows).toHaveCount(4);
  await expect(section.locator('[data-station="wok"]').getByLabel("Name: Wok")).toHaveValue("Wok");
  // The wok has dishes, so it cannot be removed.
  await expect(section.locator('[data-station="wok"]').getByRole("button", { name: "Remove: Wok" })).toBeDisabled();
  await expect(section.getByRole("button", { name: "Save stations" })).toBeDisabled();

  // A new station needs a name.
  await section.getByRole("button", { name: "Add station" }).click();
  await expect(rows).toHaveCount(5);
  await section.getByRole("button", { name: "Save stations" }).click();
  await expect(section.getByTestId("stations-status")).toContainText("needs a name");
  await rows.nth(4).getByPlaceholder("Name", { exact: true }).fill("Bar");
  // And the wok gets the kitchen's own name for it.
  await section.locator('[data-station="wok"]').getByLabel("Name: Wok").fill("Hot line");
  await section.getByRole("button", { name: "Save stations" }).click();
  await expect(section.getByTestId("stations-status")).toHaveText("Saved.");
  await expect(section.locator('[data-station="bar"]')).toBeVisible();
  await expect(section.locator('[data-station="bar"]').getByTestId("station-dishes")).toHaveText("0 dishes");

  // Egg fried rice moves to the bar.
  await page.getByRole("link", { name: /^Menu/ }).click();
  // (Wait for the page: the stations list just left also has buttons named after Rice.)
  await expect(page.getByRole("heading", { name: "Menu" })).toBeVisible();
  await page.getByRole("button", { name: "Rice飯", exact: true }).click();
  await page.getByRole("button", { name: /Egg fried rice/ }).first().click();
  const dish = page.getByTestId("dish-form");
  const station = dish.locator('select[name="dish-station"]');
  await expect(station.locator("option")).toHaveText(["Hot line 鑊", "Fryer 炸爐", "Rice 飯", "Counter 櫃檯", "Bar", "No station"]);
  await station.selectOption("bar");
  await dish.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("menu-notice")).toHaveText("Saved.");

  // An order of it shows the bar on the kitchen screen, which can be filtered to the bar.
  await openTill(page);
  for (const key of ["8", "1"]) await page.getByRole("button", { name: key, exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Send to kitchen" }).click();
  await expect(page.getByText(/Sent to the kitchen/)).toBeVisible();
  await page.getByRole("link", { name: /^Kitchen/ }).click();
  const picker = page.getByTestId("station-picker");
  await expect(picker.getByRole("button")).toHaveText(["All stations", "Hot line 鑊", "Fryer 炸爐", "Rice 飯", "Counter 櫃檯", "Bar "]);
  await picker.getByRole("button", { name: "Bar" }).click();
  const forBar = page.locator('[data-testid="kitchen-ticket"][data-for-picked="true"]');
  await expect(forBar).toHaveCount(1);
  await expect(forBar.getByTestId("station-strip")).toContainText("Bar");
  await expect(forBar).toContainText("Egg fried rice");
  // Others are still there, greyed.
  await expect(page.locator('[data-testid="kitchen-ticket"][data-for-picked="false"]').first()).toBeVisible();
  await picker.getByRole("button", { name: "All stations" }).click();

  // The slip is headed with the owner's names.
  await page.getByRole("link", { name: /^Ticket/ }).click();
  await expect(page.getByTestId("ticket-slip").first()).toContainText("BAR");

  // The bar now has a dish, so it cannot go; the list is kept after a reload.
  await openSettings(page, "flow");
  await expect(section.locator('[data-station="bar"]').getByTestId("station-dishes")).toHaveText("1 dish");
  await expect(section.locator('[data-station="bar"]').getByRole("button", { name: "Remove: Bar" })).toBeDisabled();
  await page.reload();
  await expect(section.locator('[data-station="wok"]').getByLabel("Name: Hot line")).toHaveValue("Hot line");
  await expect(rows).toHaveCount(5);
});

test("the counter PIN sees the stations but cannot change them", async ({ page }) => {
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
  // Settings shows the counter PIN Tables & printers only (RK, 27 Nov 2026); the stations are the owner's.
  await expectPinCannotSee(page, "flow");
  await expect(page.getByTestId("stations-section")).toHaveCount(0);
});

test("a restaurant in the cloud can have no stations at all", async ({ page }) => {
  test.skip(!cloudOn, cloudSkip);
  test.setTimeout(120_000);
  await joinNewShop(page, "Restaurant", "stations");

  // Every station goes: there are no dishes on them yet.
  await openSettings(page, "flow");
  const section = page.getByTestId("stations-section");
  const rows = section.getByTestId("station-row");
  await expect(rows).toHaveCount(4);
  for (let left = 4; left > 0; left -= 1) {
    await rows.first().getByRole("button", { name: /^Remove/ }).click();
    await expect(rows).toHaveCount(left - 1);
  }
  await section.getByRole("button", { name: "Save stations" }).click();
  await expect(section.getByTestId("stations-status")).toHaveText("Saved.");
  await expect(section.getByTestId("stations-none")).toBeVisible();

  // A dish has no station to choose, and the kitchen screen has nothing to filter by.
  await page.getByRole("link", { name: /^Menu/ }).click();
  await page.getByTestId("menu-tools").getByRole("button", { name: "Add category" }).click();
  await page.getByTestId("category-new").getByLabel("Name", { exact: true }).fill("Bread");
  await page.getByTestId("category-new").getByRole("button", { name: "Add category" }).click();
  await expect(page.getByTestId("category-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Add dish" }).click();
  const dish = page.getByTestId("dish-form");
  await expect(dish.locator('select[name="dish-station"]')).toHaveCount(0);
  await dish.locator('input[name="dish-name"]').fill("Loaf");
  await dish.locator('input[name="dish-price"]').fill("3");
  await dish.getByRole("button", { name: "Add to menu" }).click();
  await expect(page.getByTestId("menu-notice")).toHaveText("Added.");

  await openTill(page);
  await page.getByRole("button", { name: "1", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Send to kitchen" }).click();
  await expect(page.getByText(/Sent to the kitchen/)).toBeVisible();
  await page.getByRole("link", { name: /^Kitchen/ }).click();
  await expect(page.getByTestId("station-picker")).toHaveCount(0);
  const ticket = page.getByTestId("kitchen-ticket").first();
  await expect(ticket).toHaveAttribute("data-for-picked", "true");
  await expect(ticket).toContainText("Loaf");
  await expect(ticket.getByTestId("station-strip").locator("span")).toHaveCount(0);

  // Stations can come back later.
  await openSettings(page, "flow");
  await section.getByRole("button", { name: "Add station" }).click();
  await rows.first().getByPlaceholder("Name", { exact: true }).fill("Oven");
  await section.getByRole("button", { name: "Save stations" }).click();
  await expect(section.locator('[data-station="oven"]')).toBeVisible();
});
