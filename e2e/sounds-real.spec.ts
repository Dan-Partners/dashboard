import { expect, test, type Page } from "@playwright/test";

/**
 * Ticket sounds with a real shop server syncing to a cloud, and the
 * customer site (same environment as ordering.spec.ts):
 *
 *   DAN_E2E_SERVER_URL=… DAN_E2E_CLOUD_URL=…/staff DAN_E2E_OWNER_EMAIL=… DAN_E2E_OWNER_PASSWORD=… \
 *   DAN_E2E_PIN=… DAN_E2E_CUSTOMER_ORIGIN=http://localhost:3001 npx playwright test sounds-real
 *
 * It changes the shop's settings and puts them back at the end.
 */
const server = process.env.DAN_E2E_SERVER_URL;
const cloud = process.env.DAN_E2E_CLOUD_URL;
const ownerEmail = process.env.DAN_E2E_OWNER_EMAIL ?? "";
const ownerPassword = process.env.DAN_E2E_OWNER_PASSWORD ?? "";
const pin = process.env.DAN_E2E_PIN ?? "";
const customerSite = process.env.DAN_E2E_CUSTOMER_ORIGIN;

const played = (page: Page) => page.evaluate(() => ((window as unknown as { __danSounds?: { key: string; sound: string; place: string }[] }).__danSounds ?? []).slice());
const sw = (page: Page, key: string) => page.getByTestId(`switch-${key}`);
async function turn(page: Page, key: string, on: boolean) {
  if ((await sw(page, key).getAttribute("aria-checked")) !== String(on)) await sw(page, key).click();
  await expect(sw(page, key)).toHaveAttribute("aria-checked", String(on));
}

async function signIn(page: Page, who: "owner" | "pin") {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.getByLabel("Shop server").fill(server!);
  await page.getByLabel("Dan cloud (optional)").fill(cloud!);
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

test("a held bank transfer stays quiet, dings once in the kitchen when paid, and a reload replays nothing; the PIN cannot change sounds", async ({ browser }) => {
  test.skip(!server || !cloud || !ownerEmail || !pin || !customerSite, "Set the shop server, cloud, owner, PIN and customer site to run this.");
  test.setTimeout(180_000);
  const staffContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const counter = await staffContext.newPage();
  await signIn(counter, "owner");

  // Nothing saved for sounds: the default kitchen 叮.
  await counter.getByRole("link", { name: /^Board & sounds/ }).first().click();
  if ((await counter.getByTestId("sound-list").locator("li").count()) !== 1) {
    await counter.getByTestId("sounds-reset").click();
    await counter.getByTestId("sounds-reset").click();
  }
  await expect(counter.getByLabel("When 1")).toHaveValue("role:incoming");

  // Collection paid by bank transfer.
  await counter.getByRole("link", { name: /^Ordering & payments/ }).first().click();
  await turn(counter, "collection", true);
  if (await sw(counter, "uberDirect").isEnabled()) await turn(counter, "uberDirect", false);
  await turn(counter, "bankTransfer", true);
  await counter.getByLabel("Account name").fill("Golden Dragon Ltd");
  await counter.getByLabel("Sort code").fill("12-34-56");
  await counter.getByLabel("Account number").fill("12345678");
  await counter.getByRole("button", { name: "Save", exact: true }).click();
  await expect(counter.getByTestId("ordering-message")).toContainText("Saved.");
  await counter.getByRole("link", { name: /^Orders/ }).first().click();

  // The kitchen tablet, with sounds on.
  const kitchen = await staffContext.newPage();
  await kitchen.goto("/shop/kitchen");
  await kitchen.getByTestId("sounds-enable").click();
  await expect(kitchen.getByTestId("sounds-on")).toHaveAttribute("data-unlocked", "true");

  // A customer orders and chooses bank transfer: held off the board, no 叮.
  const who = `Sasha ${String(Date.now()).slice(-6)}`;
  const customer = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await expect(async () => {
    await customer.goto(`${customerSite}/`);
    await customer.getByRole("button", { name: /Rice/ }).first().click();
    await customer.getByRole("button", { name: /^Add: 81/ }).click({ timeout: 3000 });
    await customer.goto(`${customerSite}/checkout`);
    await customer.getByTestId("pay-bank_transfer").check({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  await customer.getByTestId("allergen-confirm").check();
  await customer.getByLabel("Name").fill(who);
  await customer.getByLabel("Phone").fill(`07700 9${String(Date.now()).slice(-5)}`);
  await customer.getByTestId("send-order").click();
  const reference = (await customer.getByTestId("bank-reference").textContent({ timeout: 15_000 }))!.trim();
  const waiting = counter.getByTestId("awaiting-transfer").filter({ hasText: reference });
  await expect(waiting).toBeVisible({ timeout: 20_000 });
  await kitchen.waitForTimeout(2000);
  expect(await played(kitchen)).toEqual([]);

  // Marked paid: it lands on the board, and the kitchen hears one 叮.
  await waiting.getByRole("button", { name: "Paid" }).click();
  await expect(kitchen.getByTestId("kitchen-ticket").filter({ hasText: /Incoming|New/ }).first()).toBeVisible({ timeout: 20_000 });
  await expect(async () => {
    const sounds = await played(kitchen);
    expect(sounds.map((entry) => `${entry.sound}@${entry.place}`)).toEqual(["ding@kitchen"]);
  }).toPass({ timeout: 20_000 });
  await kitchen.waitForTimeout(3000);
  expect((await played(kitchen)).length).toBe(1);

  // A reload, and the live channel reconnecting with it, replays nothing.
  await kitchen.reload();
  await kitchen.mouse.click(5, 5);
  await expect(kitchen.getByTestId("sounds-on")).toHaveAttribute("data-unlocked", "true");
  await kitchen.waitForTimeout(3000);
  expect(await played(kitchen)).toEqual([]);

  // The counter PIN sees the board and the sounds, but cannot save either.
  const pinPage = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await signIn(pinPage, "pin");
  await pinPage.getByRole("link", { name: /^Board & sounds/ }).first().click();
  await expect(pinPage.getByTestId("board-owner-only")).toBeVisible();
  await expect(pinPage.getByRole("button", { name: "Save board" })).toHaveCount(0);
  await expect(pinPage.getByRole("button", { name: "Save sounds" })).toHaveCount(0);
  await expect(pinPage.getByLabel("When 1")).toBeDisabled();

  // Put the shop back as it was.
  await counter.getByRole("link", { name: /^Ordering & payments/ }).first().click();
  await turn(counter, "bankTransfer", false);
  await counter.getByRole("button", { name: "Save", exact: true }).click();
  await expect(counter.getByTestId("ordering-message")).toContainText("Saved.");
});
