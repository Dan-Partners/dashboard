import { expect, test, type Page } from "@playwright/test";

/**
 * Dish photos, end to end: the owner adds one through the Dan cloud; it is
 * on the Menu page and the till at once, on the shop server after its sync,
 * and on the customer site; then it is removed.
 *
 * Opt in with a shop server syncing to a cloud that keeps photos, and the
 * shop's customer site:
 *
 *   DAN_E2E_SERVER_URL=http://127.0.0.1:2283 DAN_E2E_CLOUD_URL=http://goldendragon.localhost:2290/staff \
 *   DAN_E2E_OWNER_EMAIL=… DAN_E2E_OWNER_PASSWORD=… DAN_E2E_CUSTOMER_ORIGIN=http://localhost:3001 \
 *   npx playwright test photos
 */
const server = process.env.DAN_E2E_SERVER_URL;
const cloud = process.env.DAN_E2E_CLOUD_URL;
const ownerEmail = process.env.DAN_E2E_OWNER_EMAIL ?? "";
const ownerPassword = process.env.DAN_E2E_OWNER_PASSWORD ?? "";
const customerSite = process.env.DAN_E2E_CUSTOMER_ORIGIN;

test.skip(!server || !cloud || !ownerEmail || !customerSite, "Set the shop server, cloud, owner and customer site to run this.");

/** A real JPEG, drawn by the browser: a plate of egg fried rice, roughly. */
async function aPhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 900;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#3b2a1a";
    context.fillRect(0, 0, 1200, 900);
    context.fillStyle = "#f4f1ea";
    context.beginPath();
    context.arc(600, 450, 380, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#e8c35a";
    context.beginPath();
    context.arc(600, 450, 260, 0, Math.PI * 2);
    context.fill();
    return canvas.toDataURL("image/jpeg", 0.9);
  });
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

test("the owner adds a dish photo through the cloud; the menu, till and customer site show it", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/connect");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.getByLabel("Shop server").fill(server!);
  await page.getByLabel("Dan cloud (optional)").fill(cloud!);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.getByTestId("connection-status")).toHaveAttribute("data-cloud", "connected");

  await page.getByRole("link", { name: /^Menu/ }).first().click();
  await page.getByRole("button", { name: /Rice/ }).first().click();
  await page.getByRole("button", { name: /Egg fried rice/ }).first().click();
  const picker = page.getByTestId("photo-picker");
  await expect(picker.getByRole("button", { name: /Add photo|Replace photo/ })).toBeEnabled();
  await page.getByTestId("photo-input").setInputFiles({ name: "rice.jpg", mimeType: "image/jpeg", buffer: await aPhoto(page) });
  await expect(page.getByTestId("photo-status")).toHaveText(/Photo saved/, { timeout: 20_000 });
  const thumb = picker.getByTestId("dish-photo");
  await expect(thumb).toBeVisible();
  const src = await thumb.getAttribute("src");
  expect(src).toMatch(/^http:\/\/goldendragon\.localhost:2290\/images\/[0-9a-f]{64}\/thumb\.jpg$/);
  expect(await thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Cancel" }).click();

  // On the shop server too, after its sync (a reload fetches the menu from it).
  await page.reload();
  await page.getByRole("button", { name: /Rice/ }).first().click();
  await expect(page.locator(`img[src="${src}"]`).first()).toBeVisible({ timeout: 20_000 });

  // The till shows the dish being keyed.
  await page.getByRole("link", { name: /^Till/ }).first().click();
  for (const key of ["8", "1"]) await page.getByRole("button", { name: key, exact: true }).click();
  await expect(page.locator(`img[src="${src}"]`).first()).toBeVisible();

  // The customer site: small in the list, large when tapped.
  const customer = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await customer.goto(`${customerSite}/`);
  await customer.getByRole("button", { name: /Rice/ }).first().click();
  const listed = customer.getByTestId("photo-81");
  await expect(listed).toBeVisible({ timeout: 15_000 });
  expect(await listed.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await customer.getByRole("button", { name: /Photo of .*Egg fried rice/ }).click();
  const large = customer.getByRole("img", { name: "Egg fried rice" });
  await expect(large).toBeVisible();
  await expect.poll(() => large.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(480);
  await customer.getByRole("button", { name: "Close" }).click();

  // Removed by the owner: gone from the menu.
  await page.getByRole("link", { name: /^Menu/ }).first().click();
  await page.getByRole("button", { name: /Rice/ }).first().click();
  await page.getByRole("button", { name: /Egg fried rice/ }).first().click();
  await picker.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByTestId("photo-status")).toHaveText("Photo removed.");
  await expect(picker.getByTestId("dish-photo")).toHaveCount(0);
});

test("without the cloud, a photo cannot be added and the owner is told why", async ({ page }) => {
  await page.goto("/connect");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.getByLabel("Shop server").fill(server!);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill(ownerPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await page.getByRole("link", { name: /^Menu/ }).first().click();
  await page.getByRole("button", { name: /Rice/ }).first().click();
  await page.getByRole("button", { name: /Egg fried rice/ }).first().click();
  await expect(page.getByTestId("photo-picker").getByRole("button", { name: "Add photo" })).toBeDisabled();
  await expect(page.getByTestId("photo-status")).toHaveText(/through the Dan cloud, which is not connected/);
});
