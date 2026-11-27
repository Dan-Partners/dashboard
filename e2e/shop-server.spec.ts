import { execSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

/**
 * A shop server whose shop lives in the Dan cloud (RK, 27 Nov 2026, DAN-34):
 * the cloud is where the shop's settings live, the machine is where its orders
 * live. On the machine the owner's settings are saved to the cloud, only while
 * the machine is connected to it with a valid key. Orders, sold out and the
 * printers stay on the machine whatever happens.
 *
 * The first test needs the shop server (started from its key) and the owner's
 * sign-in. The cloud's address is never typed: the machine says it.
 *
 *   DAN_E2E_SERVER_URL=http://127.0.0.1:2283 DAN_E2E_CLOUD_URL=… \
 *   DAN_E2E_OWNER_EMAIL=… DAN_E2E_OWNER_PASSWORD=… npx playwright test shop-server
 *
 * The second also stops and starts the cloud (so never against Dan's own):
 * DAN_E2E_CLOUD_STOP='…' DAN_E2E_CLOUD_START='…'.
 *
 * The third needs a shop server whose key the cloud refuses (deactivated, or
 * a wrong key) and its counter PIN: DAN_E2E_REFUSED_SERVER_URL, DAN_E2E_REFUSED_PIN.
 */
const server = process.env.DAN_E2E_SERVER_URL;
const cloud = process.env.DAN_E2E_CLOUD_URL;
const ownerEmail = process.env.DAN_E2E_OWNER_EMAIL ?? "";
const ownerPassword = process.env.DAN_E2E_OWNER_PASSWORD ?? "";
const stopCloud = process.env.DAN_E2E_CLOUD_STOP;
const startCloud = process.env.DAN_E2E_CLOUD_START;
const refused = process.env.DAN_E2E_REFUSED_SERVER_URL;
const refusedPin = process.env.DAN_E2E_REFUSED_PIN ?? "";

async function connect(page: Page, address: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/connect");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  // No cloud field: the shop server knows its cloud from its key.
  await expect(page.getByLabel("Dan cloud (optional)")).toHaveCount(0);
  await page.getByLabel("Shop server").fill(address);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
}

async function signInOwner(page: Page) {
  // The cloud's one address, as the machine says it (DAN-43).
  const said = await onMachine<{ data: { ping: { cloudUrl: string | null } } }>("{ ping { cloudUrl } }");
  await connect(page, server!);
  await expect(page.getByTestId("connect-servers")).toContainText(said.data.ping.cloudUrl!);
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-cloud", "connected");
}

/** The machine's own answer, straight from it. */
async function onMachine<T>(query: string, token?: string): Promise<T> {
  const response = await fetch(`${server}/graphql`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query }),
  });
  return (await response.json()) as T;
}

test("on the shop's machine the owner's settings are saved to the Dan cloud, and the machine follows", async ({ page }) => {
  test.skip(!server || !cloud || !ownerEmail, "needs the shop server started from its key, and the owner's sign-in");
  test.setTimeout(90_000);
  await signInOwner(page);
  const token = await page.evaluate(() => JSON.parse(localStorage.getItem("dan.v1")!).session.token as string);

  // The machine itself refuses a change to the shop's settings.
  const direct = await onMachine<{ errors?: { extensions?: { code?: string } }[] }>('mutation { updateShop(patch: { phone: "0" }) { phone } }', token);
  expect(direct.errors?.[0]?.extensions?.code).toBe("settings_in_cloud");

  await page.goto("/shop/settings/shop");
  await expect(page.getByTestId("settings-read-only")).toHaveCount(0);
  const details = page.getByTestId("shop-details");
  const phone = details.getByLabel("Phone");
  const before = await phone.inputValue();
  const next = `0113 496 ${String(Date.now()).slice(-4)}`;
  await phone.fill(next);
  await details.getByRole("button", { name: "Save details" }).click();
  await expect(details.getByText("Saved.")).toBeVisible();

  // Saved in the cloud; the machine has it on its next round.
  await expect
    .poll(async () => (await onMachine<{ data: { ping: { shop: { phone: string } } } }>("{ ping { shop { phone } } }")).data.ping.shop.phone, { timeout: 20_000 })
    .toBe(next);

  await phone.fill(before);
  await details.getByRole("button", { name: "Save details" }).click();
  await expect(details.getByText("Saved.")).toBeVisible();
  await expect
    .poll(async () => (await onMachine<{ data: { ping: { shop: { phone: string } } } }>("{ ping { shop { phone } } }")).data.ping.shop.phone, { timeout: 20_000 })
    .toBe(before);
});

test("while the machine is not connected to the cloud, settings are read only and sold out still works", async ({ page }) => {
  test.skip(!server || !cloud || !ownerEmail || !stopCloud || !startCloud, "needs the shop server, the owner's sign-in, and commands that stop and start the cloud");
  test.setTimeout(150_000);
  await signInOwner(page);
  try {
    execSync(stopCloud!, { stdio: "inherit" });
    await page.goto("/shop/settings/shop");
    // The machine counts as connected for 30 seconds after its last round.
    const note = page.getByTestId("settings-read-only");
    await expect(note).toHaveAttribute("data-reason", "offline", { timeout: 60_000 });
    await expect(page.getByTestId("settings-fields")).toHaveAttribute("disabled", "");
    await expect(page.getByTestId("shop-details").getByRole("button", { name: "Save details" })).toBeDisabled();

    // The menu: looked at, not edited. Sold out is the machine's own and still works.
    await page.goto("/shop/menu");
    await expect(page.getByTestId("settings-read-only")).toBeVisible();
    await expect(page.getByTestId("menu-tools")).toHaveCount(0);
    const soldOut = page.getByRole("switch").first();
    const was = await soldOut.getAttribute("aria-checked");
    await soldOut.click();
    await expect(soldOut).not.toHaveAttribute("aria-checked", was!);
    await soldOut.click();
    await expect(soldOut).toHaveAttribute("aria-checked", was!);

    // Tables & printers stay the machine's.
    await page.goto("/shop/settings/tables");
    await expect(page.getByTestId("settings-read-only")).toHaveCount(0);
    await expect(page.getByTestId("settings-fields")).not.toHaveAttribute("disabled");
  } finally {
    execSync(startCloud!, { stdio: "inherit" });
  }
  await page.goto("/shop/settings/shop");
  await expect(page.getByTestId("settings-page")).toBeVisible();
  await expect(page.getByTestId("settings-read-only")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("settings-fields")).not.toHaveAttribute("disabled");
});

test("a shop server whose key the cloud refuses carries on alone and says the key is not valid", async ({ page }) => {
  test.skip(!refused || !refusedPin, "needs a shop server whose key the cloud refuses, and its counter PIN");
  test.setTimeout(60_000);
  await connect(page, refused!);
  await page.getByRole("button", { name: "PIN", exact: true }).click();
  await page.getByLabel("PIN").fill(refusedPin);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  // Everyone at the counter sees it, the PIN included, and it cannot be hidden.
  await expect(page.getByTestId("key-refused")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("sync-line")).toHaveText("Key not valid");
  // The counter carries on: the till is there.
  await page.goto("/shop/menu");
  await expect(page.getByRole("switch").first()).toBeEnabled();
});
