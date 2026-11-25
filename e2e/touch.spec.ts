import { expect, test, type Page } from "@playwright/test";

/**
 * The counter on a touch tablet (an iPad-sized screen with touch), on the
 * demo: double taps move an order one step only, the lock is held with a
 * finger, and every control is big enough to hit.
 */
test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });

/** Two taps 120ms apart, where the first one landed: a double tap. */
async function doubleTap(page: Page, x: number, y: number) {
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(120);
  await page.touchscreen.tap(x, y);
}

async function centre(page: Page, selector: ReturnType<Page["locator"]>) {
  const box = (await selector.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A finger held on the lock, with real touch events. */
async function holdLockWithFinger(page: Page, ms: number) {
  const { x, y } = await centre(page, page.getByTestId("focus-unlock"));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.waitForTimeout(ms);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function lockTo(page: Page, position: "kitchen" | "pass" | "till") {
  await page.getByTestId("focus-button").first().tap();
  await page.getByTestId(`focus-${position}`).tap();
  await expect(page.getByTestId("focus-status")).toBeVisible();
}

test("on a tablet, a double tap moves an order one step, the lock is held with a finger, and controls are big enough", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/shop/orders?demo=1");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await lockTo(page, "kitchen");

  // Every control on the locked kitchen is at least 44 by 44 pixels.
  for (const control of await page.locator("main button, header button").all()) {
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    if (!box) continue;
    expect(box.height, await control.innerText()).toBeGreaterThanOrEqual(44);
    expect(box.width, await control.innerText()).toBeGreaterThanOrEqual(44);
  }

  // The same on the locked till, with a dish on the slip.
  await holdLockWithFinger(page, 3300);
  await lockTo(page, "till");
  for (const key of ["8", "1"]) await page.getByRole("button", { name: key, exact: true }).tap();
  await page.getByRole("button", { name: "Add", exact: true }).tap();
  for (const control of await page.locator("main button, header button").all()) {
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    if (!box) continue;
    const name = (await control.getAttribute("aria-label")) ?? (await control.innerText());
    expect(box.height, name).toBeGreaterThanOrEqual(44);
    expect(box.width, name).toBeGreaterThanOrEqual(44);
  }
  await holdLockWithFinger(page, 3300);
  await lockTo(page, "kitchen");

  // Start then Ready sit in the same spot: a double tap only starts the order.
  const fresh = page.locator('[data-testid="kitchen-ticket"][data-status="new"]').first();
  await expect(fresh).toBeVisible();
  const id = await fresh.getAttribute("aria-label");
  const start = await centre(page, fresh.getByRole("button", { name: "Start" }));
  const number = id!.split(" · ")[0];
  await doubleTap(page, start.x, start.y);
  const same = page.locator('[data-testid="kitchen-ticket"]').filter({ has: page.getByRole("heading", { name: number, exact: true }) });
  await expect(same).toHaveAttribute("data-status", "preparing");
  await page.waitForTimeout(1000);
  await expect(same).toHaveAttribute("data-status", "preparing");

  // A deliberate tap a moment later does mark it ready: two ready orders now.
  await same.getByRole("button", { name: "Ready" }).tap();
  await expect(same).toHaveAttribute("data-status", "ready");

  // Long-pressing a ticket selects nothing.
  const text = await centre(page, same.getByRole("heading", { name: number, exact: true }));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [text] });
  await page.waitForTimeout(900);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect(await page.evaluate(() => String(window.getSelection()))).toBe("");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY)).toBe("none");

  // The lock, held with a finger: not long enough, then long enough.
  await holdLockWithFinger(page, 1500);
  await expect(page.getByTestId("focus-status")).toBeVisible();
  await holdLockWithFinger(page, 3300);
  await expect(page.getByTestId("focus-status")).toHaveCount(0);

  // At the pass, Served slides the next ticket into place: a double tap serves one.
  await lockTo(page, "pass");
  const tickets = page.getByTestId("pass-ticket");
  await expect(tickets.nth(1)).toBeVisible();
  const before = await tickets.count();
  const served = await centre(page, tickets.first().getByRole("button"));
  await doubleTap(page, served.x, served.y);
  await page.waitForTimeout(1000);
  await expect(tickets).toHaveCount(before - 1);
});
