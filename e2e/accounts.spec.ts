import { execFileSync } from "node:child_process";
import { expectPinCannotSee, openSettings } from "./settings";
import { expect, test, type Page } from "@playwright/test";
import { openTill } from "./create-order";

/**
 * Accounts in the Dan cloud, end to end: the waiting list, an invite link made
 * by command, joining, building a menu, taking an order, signing in again with
 * an email and with the counter PIN, and a password-reset link.
 *
 * Needs a running Dan cloud that allows this dashboard's address, the
 * dashboard built with NEXT_PUBLIC_DAN_CLOUD_URL pointing at it, and the
 * cloud's command to make links with:
 *
 *   DAN_E2E_ACCOUNTS=1 DAN_E2E_CLOUD=http://localhost:2290 \
 *   DAN_E2E_CLOUD_BIN=../cloud/target/debug/dan-cloud \
 *   DAN_E2E_CLOUD_MONGODB_URI=mongodb://127.0.0.1:27017 DAN_E2E_CLOUD_DATABASE=dan_c9 \
 *   npx playwright test accounts
 */
const cloud = process.env.DAN_E2E_CLOUD;
const bin = process.env.DAN_E2E_CLOUD_BIN;
/** The customer site the cloud lets order from its shops (DAN_SHOP_SITE). */
const customerSite = process.env.DAN_E2E_CUSTOMER_ORIGIN ?? "http://localhost:3001";
const on = Boolean(process.env.DAN_E2E_ACCOUNTS && cloud && bin);

/** Runs the cloud's command, as Dan would. */
function danCloud(...args: string[]): string {
  return execFileSync(bin!, args, {
    encoding: "utf8",
    env: {
      ...process.env,
      DAN_MONGODB_URI: process.env.DAN_E2E_CLOUD_MONGODB_URI ?? "mongodb://127.0.0.1:27017",
      DAN_DATABASE: process.env.DAN_E2E_CLOUD_DATABASE ?? "dan_cloud",
      DAN_DASHBOARD_ORIGINS: "http://localhost:3000",
    },
  });
}

/** The link in a command's output. */
function linkIn(output: string, page: "join" | "reset"): string {
  const found = output.match(new RegExp(`http://localhost:3000/${page}#[0-9a-f]{64}`));
  expect(found, output).not.toBeNull();
  return found![0];
}

async function ready(page: Page) {
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
}

async function signOut(page: Page) {
  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("sign-in")).toBeVisible();
}

test("a business joins from the waiting list, builds its menu, takes an order and signs in again", async ({ page, browser, request }) => {
  test.skip(!on, "Needs a running Dan cloud and its command; see the comment at the top.");
  test.setTimeout(180_000);
  const stamp = Date.now().toString(36);
  const email = `owner-${stamp}@e2e.example`;
  const shopName = `E2E Bakery ${stamp}`;
  const address = `e2e-bakery-${stamp}`;
  const password = "three small words";
  await page.setViewportSize({ width: 1280, height: 900 });

  // Anyone can leave an email.
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
  const waitlist = page.getByTestId("waitlist");
  await waitlist.getByLabel("Your email").fill("someone@nodot");
  await waitlist.getByRole("button", { name: "Join the waiting list" }).click();
  await expect(waitlist.getByRole("alert")).toContainText("does not look like an email");
  await waitlist.getByLabel("Your email").fill(email);
  await waitlist.getByRole("button", { name: "Join the waiting list" }).click();
  await expect(page.getByTestId("waitlist-done")).toContainText("You are on the list");

  // Nobody can sign in with it yet.
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("sign-in-error")).toContainText("email or password is not right");

  // Dan sees the list and makes an invite link for the email.
  expect(danCloud("waitlist", "list")).toMatch(new RegExp(`${email}\\s+asked \\S+\\s+waiting`));
  const invite = linkIn(danCloud("waitlist", "invite", email), "join");
  expect(danCloud("waitlist", "list")).toMatch(new RegExp(`${email}.*invited`));

  // The invited person sets up the shop.
  await page.goto(invite);
  await expect(page.getByTestId("join-email")).toHaveText(email);
  // The token is taken out of the address bar.
  expect(new URL(page.url()).hash).toBe("");
  await page.getByLabel("Your name").fill("Mei Chan");
  await page.getByLabel("Shop name").fill(shopName);
  await expect(page.getByLabel("Address name")).toHaveValue(address);
  await expect(page.getByTestId("join-address")).toHaveAttribute("data-available", "true");
  await expect(page.getByTestId("join-address")).toContainText("is free.");
  // A name someone else has, or one Dan keeps, is not available.
  await page.getByLabel("Address name").fill("goldendragon");
  await expect(page.getByTestId("join-address")).toHaveAttribute("data-available", "false");
  await page.getByLabel("Address name").fill("support");
  await expect(page.getByTestId("join-address")).toHaveAttribute("data-available", "false");
  await page.getByLabel("Address name").fill(address);
  await expect(page.getByTestId("join-address")).toHaveAttribute("data-available", "true");
  await page.getByLabel("Restaurant").check();
  // A weak password is refused by the cloud, and the invite still works.
  await page.getByLabel("Choose a password").fill("password123");
  await page.getByRole("button", { name: "Create my shop" }).click();
  await expect(page.getByTestId("join-error")).toContainText("at least 10 characters");
  await page.getByLabel("Choose a password").fill(password);
  await page.getByRole("button", { name: "Create my shop" }).click();

  // A new shop opens on its empty menu, in the cloud.
  await expect(page.getByRole("heading", { name: "Menu" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("menu-empty")).toContainText("Your menu is empty");
  await expect(page.getByTestId("connection-status").first()).toHaveAttribute("data-home", "cloud");
  await expect(page.getByTestId("signed-in-as").first()).toContainText("Owner");
  await expect(page.getByText(shopName).first()).toBeVisible();

  // Categories, then dishes.
  await page.getByTestId("menu-tools").getByRole("button", { name: "Add category" }).click();
  const newCategory = page.getByTestId("category-new");
  await newCategory.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByTestId("category-error")).toContainText("needs a name");
  await newCategory.getByLabel("Name", { exact: true }).fill("Bread");
  await newCategory.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByTestId("category-row")).toHaveCount(1);
  await newCategory.getByLabel("Name", { exact: true }).fill("Drinks");
  await newCategory.getByLabel("Chinese name (optional)").fill("飲品");
  await newCategory.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByTestId("category-row")).toHaveCount(2);
  // Drinks moves first, then goes: it is empty.
  await page.getByRole("button", { name: "Move up: Drinks" }).click();
  await expect(page.getByTestId("category-row").first()).toHaveAttribute("data-category", "Drinks");
  await page.getByTestId("category-row").first().getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("category-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByTestId("category-empty")).toBeVisible();

  await page.getByRole("button", { name: "Add dish" }).click();
  const dish = page.getByTestId("dish-form");
  await expect(dish.locator('input[name="dish-number"]')).toHaveValue("1");
  await dish.getByRole("button", { name: "Add to menu" }).click();
  await expect(page.getByTestId("dish-error")).toContainText("Check the number, names and price");
  await dish.locator('input[name="dish-name"]').fill("Sourdough loaf");
  await dish.locator('input[name="dish-price"]').fill("4.50");
  await dish.getByLabel("Gluten").check();
  await dish.getByRole("button", { name: "Add to menu" }).click();
  await expect(page.getByTestId("menu-notice")).toHaveText("Added.");
  await expect(page.getByRole("button", { name: /Sourdough loaf/ })).toContainText("£4.50");
  // A second dish, then it is removed for good.
  await page.getByRole("button", { name: "Add dish" }).click();
  await expect(dish.locator('input[name="dish-number"]')).toHaveValue("2");
  await dish.locator('input[name="dish-name"]').fill("Stale loaf");
  await dish.locator('input[name="dish-price"]').fill("1");
  await dish.getByRole("button", { name: "Add to menu" }).click();
  await page.getByRole("button", { name: /Stale loaf/ }).click();
  await page.getByTestId("dish-remove").click();
  await page.getByTestId("dish-remove-confirm").click();
  await expect(page.getByTestId("menu-notice")).toHaveText("Removed.");
  await expect(page.getByRole("button", { name: /Stale loaf/ })).toHaveCount(0);

  // The shop's details.
  await openSettings(page, "shop");
  const details = page.getByTestId("shop-details");
  await expect(details.getByLabel("Shop name")).toHaveValue(shopName);
  await details.getByLabel("Phone").fill("020 7946 0000");
  await details.getByLabel("Town or city").fill("London");
  await details.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByTestId("shop-details-status")).toHaveText("Saved.");
  await expect(page.getByTestId("counter-pin")).toHaveCount(0);

  // Staff, each with their own name and PIN (DAN-44). There is no shared PIN.
  await openSettings(page, "staff");
  const staff = page.getByTestId("staff-settings").filter({ visible: true });
  await expect(staff.getByTestId("address-name")).toHaveText(address);
  await expect(staff.getByTestId("staff-empty")).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await staff.getByLabel("Name", { exact: true }).fill("Kit Chan");
  await staff.getByLabel("Their PIN").fill("2468");
  await staff.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("staff-status")).toContainText("Kit Chan can sign in now");
  await expect(staff.getByTestId("staff-name")).toHaveText(["Kit Chan"]);
  page.once("dialog", (dialog) => void dialog.accept());
  await staff.getByLabel("Name", { exact: true }).fill("kit chan");
  await staff.getByLabel("Their PIN").fill("1111");
  await staff.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("staff-status")).toContainText("already has that name");

  // An order at the till: with no shop machine, the cloud numbers it at once, from 1.
  await openTill(page);
  await page.getByRole("button", { name: "1", exact: true }).click();
  await expect(page.getByText("Sourdough loaf").first()).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Send to kitchen" }).click();
  await expect(page.getByText(/Sent to the kitchen/)).toBeVisible();
  await page.getByRole("link", { name: /^Orders/ }).first().click();
  await expect(page.getByTestId("docket-number").first()).toContainText("1");

  // The shop's public address answers customers already.
  // (Asked by address, with the shop named in the Host header: this process cannot look up *.localhost.)
  const answer = await request.post(`${cloud!.replace("localhost", "127.0.0.1")}/graphql`, {
    headers: { host: `${address}.localhost:2290`, origin: customerSite, "content-type": "application/json" },
    data: { query: "{ shop { name phone } }" },
  });
  expect(answer.ok()).toBeTruthy();
  expect((await answer.json()).data.shop).toEqual({ name: shopName, phone: "020 7946 0000" });

  // (Pages already visited can stay in the document, hidden: look inside the sign-in form.)
  const signIn = page.getByTestId("sign-in");
  // Signing in again: a wrong password says little, the right one finds the shop.
  await signOut(page);
  await signIn.getByLabel("Email", { exact: true }).fill(email);
  await signIn.getByLabel("Password").fill("not the password");
  await signIn.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("sign-in-error")).toContainText("email or password is not right");
  await signIn.getByLabel("Password").fill(password);
  await signIn.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.getByTestId("docket-number").first()).toContainText("1");

  // A staff member's own name and PIN, with the shop's address name remembered on this device.
  await signOut(page);
  await signIn.getByRole("button", { name: "Staff PIN" }).click();
  await expect(signIn.getByLabel("Shop address name")).toHaveValue(address);
  await signIn.getByLabel("Your name").fill("KIT CHAN");
  await signIn.getByLabel("PIN", { exact: true }).fill("0000");
  await signIn.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("sign-in-error")).toContainText("not recognised");
  await signIn.getByLabel("Shop address name").fill("no-such-shop-anywhere");
  await signIn.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByTestId("sign-in-error")).toContainText("No shop has that address name");
  await signIn.getByLabel("Shop address name").fill(address);
  await signIn.getByLabel("PIN", { exact: true }).fill("2468");
  await signIn.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.getByTestId("signed-in-as").first()).toContainText("Kit Chan");
  await page.getByRole("link", { name: /^Menu/ }).click();
  await expect(page.getByTestId("menu-counter-note")).toBeVisible();
  await expect(page.getByTestId("menu-tools")).toHaveCount(0);
  await expectPinCannotSee(page, "shop");
  await expect(page.getByTestId("shop-details")).toHaveCount(0);
  await expectPinCannotSee(page, "staff");
  await expect(page.getByTestId("staff-settings")).toHaveCount(0);
  // Staff never see who took an order.
  await page.goto("/shop/orders");
  await expect(page.getByTestId("docket-number").first()).toBeVisible();
  await expect(page.getByTestId("order-taken-by")).toHaveCount(0);

  // The owner sees who did what: the activity log, and who took each order.
  await signOut(page);
  await signIn.getByRole("button", { name: "Owner", exact: true }).click();
  await signIn.getByLabel("Email", { exact: true }).fill(email);
  await signIn.getByLabel("Password").fill(password);
  await signIn.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await openSettings(page, "staff");
  await page.getByTestId("activity-link").filter({ visible: true }).click();
  const log = page.getByTestId("activity").filter({ visible: true });
  await expect(log.locator('[data-testid="activity-entry"][data-action="signed_in"]').first()).toContainText("Kit Chan");
  await expect(log.locator('[data-testid="activity-entry"][data-action="order_taken"]').first()).toBeVisible();
  await expect(log.locator('[data-testid="activity-entry"][data-action="addStaff"]').first()).toBeVisible();

  // The invite is spent.
  const stranger = await (await browser.newContext()).newPage();
  await stranger.goto(invite);
  await expect(stranger.getByTestId("link-invalid")).toContainText("has been used or has run out");
  await stranger.goto("/join");
  await expect(stranger.getByTestId("link-invalid")).toBeVisible();

  // A reset link from Dan: a new password, and the old one stops.
  const reset = linkIn(danCloud("shop", "reset-link", email), "reset");
  await stranger.goto(reset);
  await expect(stranger.getByTestId("new-password")).toContainText(email);
  await stranger.getByLabel("New password").fill("four brand new words");
  await stranger.getByLabel("Type it again").fill("four brand new wordz");
  await stranger.getByRole("button", { name: "Save and sign in" }).click();
  await expect(stranger.getByTestId("new-password-error")).toContainText("do not match");
  await stranger.getByLabel("Type it again").fill("four brand new words");
  await stranger.getByRole("button", { name: "Save and sign in" }).click();
  await expect(stranger.getByRole("heading", { name: "Orders" })).toBeVisible({ timeout: 20_000 });
  await expect(stranger.getByTestId("signed-in-as").first()).toContainText("Owner");
  const old = await request.post(`${cloud}/v1/login`, { headers: { origin: "http://localhost:3000" }, data: { email, password } });
  expect(old.status()).toBe(401);
  await stranger.goto(reset);
  await expect(stranger.getByTestId("link-invalid")).toBeVisible();

  expect(danCloud("shop", "list")).toMatch(new RegExp(`${shopName}\\s+${address}\\s+cloud\\s+${email}`));
});
