import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("an unreachable server gets a clear error, then the demo can take an order", async ({ page }) => {
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  // The first page signs in through the Dan cloud; a shop's own server is one link away.
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByTestId("use-shop-server").click();
  await expect(page.getByRole("heading", { name: "Connect" })).toBeVisible();
  await page.getByLabel("Shop server").fill("http://127.0.0.1:9");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText(/No Dan server answered/i)).toBeVisible();

  // (The page a link left behind can stay in the document, hidden: take the button on show.)
  await page.getByTestId("demo-button").filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.getByText("Golden Dragon").first()).toBeVisible();
  await expect(page.getByText("金龍").first()).toBeVisible();

  await page.getByRole("link", { name: /^Till/ }).click();
  await expect(page.getByRole("heading", { name: "Till" })).toBeVisible();
  await page.getByRole("button", { name: "8", exact: true }).click();
  await page.getByRole("button", { name: "1", exact: true }).click();
  await expect(page.getByText("Egg fried rice · 蛋炒飯")).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Send to kitchen" }).click();
  await expect(page.getByText(/Sent to the kitchen/)).toBeVisible();
  await page.getByRole("link", { name: "View ticket" }).click();

  const slip = page.getByTestId("ticket-slip");
  await expect(slip).toContainText("GOLDEN DRAGON");
  await expect(slip).toContainText("Egg fried rice");
  await expect(slip).toContainText("蛋炒飯");
  await expect(slip).toContainText("WOK");
});

test("a link with ?demo=1 opens the demo straight on the orders board", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/shop/orders?demo=1");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.getByTestId("connection-status")).toContainText("Demo");
  // Without it, nobody signed in is sent to the sign-in page.
  await page.evaluate(() => localStorage.clear());
  await page.goto("/shop/orders");
  await expect(page.getByTestId("sign-in")).toBeVisible();
});
