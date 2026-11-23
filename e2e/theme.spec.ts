import { expect, test, type Page } from "@playwright/test";

const token = (page: Page, name: string) =>
  page.evaluate((property) => document.documentElement.style.getPropertyValue(property), name);

const background = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
});

test("a theme picked on the connect screen is applied, saved, and painted before React loads", async ({ page }) => {
  expect(await background(page)).toBe("rgb(245, 238, 220)");

  await page.getByTestId("theme-button").click();
  await expect(page.getByRole("heading", { name: "Theme" })).toBeVisible();
  await page.getByTestId("theme-ink").click();
  await expect(page.getByTestId("theme-ink")).toHaveAttribute("aria-pressed", "true");
  expect(await background(page)).toBe("rgb(27, 25, 22)");
  await page.getByRole("button", { name: "Done" }).click();

  // Stop the page as soon as the document commits: the colours must already be there.
  await page.reload({ waitUntil: "commit" });
  expect(await token(page, "--dan-paper")).toBe("#1b1916");
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  expect(await background(page)).toBe("rgb(27, 25, 22)");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ink");
});

test("the theme follows the counter, and the printed ticket stays black on white", async ({ page }) => {
  await page.getByTestId("demo-button").click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();

  await page.getByTestId("theme-button").first().click();
  await page.getByTestId("theme-seal").click();
  await page.getByRole("button", { name: "Done" }).click();
  // Seal: the side menu sits on vermilion, the page stays ivory.
  const menu = page.getByRole("complementary");
  expect(await menu.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(184, 58, 46)");
  expect(await background(page)).toBe("rgb(245, 238, 220)");

  await page.getByTestId("theme-button").first().click();
  await page.getByTestId("theme-ink").click();
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByRole("link", { name: /^Ticket/ }).click();
  const slip = page.getByTestId("ticket-slip");
  await expect(slip).toContainText("GOLDEN DRAGON");
  expect(await slip.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 254, 248)");
  expect(await slip.evaluate((element) => getComputedStyle(element).color)).toBe("rgb(26, 22, 18)");
});

test("a custom theme keeps text readable, rejects half a colour, and can be reset", async ({ page }) => {
  await page.getByTestId("theme-button").click();
  await page.getByTestId("theme-jade").click();
  await page.getByRole("button", { name: "Customise" }).click();
  await expect(page.getByRole("heading", { name: "Customise theme" })).toBeVisible();
  // Customising starts from the theme that was showing.
  await expect(page.getByTestId("theme-accent")).toHaveValue("#2e6b4f");
  await expect(page.getByTestId("theme-adjusted")).toHaveCount(0);

  // Cream text on cream paper would vanish.
  await page.getByTestId("theme-ink").fill("#f0eee0");
  await expect(page.getByTestId("theme-adjusted")).toContainText("hard to read");
  expect(await token(page, "--dan-ink")).not.toBe("#f0eee0");

  // Half a colour is not applied and says why.
  const before = await token(page, "--dan-paper");
  await page.getByTestId("theme-paper").fill("#12");
  await expect(page.getByText("Use a six-digit hex colour")).toBeVisible();
  expect(await token(page, "--dan-paper")).toBe(before);

  await page.getByTestId("theme-paper").fill("#102030");
  expect(await token(page, "--dan-paper")).toBe("#102030");
  await page.getByTestId("theme-chrome-accent").click();
  expect(await token(page, "--dan-chrome-paper")).toBe(await token(page, "--dan-accent"));

  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "custom");
  expect(await token(page, "--dan-paper")).toBe("#102030");

  await page.getByTestId("theme-button").click();
  await page.getByRole("button", { name: "Customise" }).click();
  await page.getByRole("button", { name: "Reset to Dan" }).click();
  await expect(page.getByTestId("theme-dan")).toHaveAttribute("aria-pressed", "true");
  expect(await background(page)).toBe("rgb(245, 238, 220)");
});

test("tampered storage cannot inject styles", async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "dan.theme",
      JSON.stringify({
        scheme: "dark",
        vars: {
          "--dan-paper": "#000000;} body{display:none} :root{--x:1",
          "--dan-ink": "url(https://example.invalid/track)",
          "background-image": "#ffffff",
        },
      }),
    );
    const saved = JSON.parse(localStorage.getItem("dan.v1") ?? "{}");
    saved.theme = { preset: "custom", custom: { paper: "red;display:none", ink: "#zzzzzz", accent: "expression(alert(1))", chrome: "everywhere" } };
    localStorage.setItem("dan.v1", JSON.stringify(saved));
  });
  await page.reload({ waitUntil: "commit" });
  expect(await token(page, "--dan-paper")).toBe("");
  expect(await token(page, "--dan-ink")).toBe("");
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  // Every bad value fell back to the Dan preset.
  expect(await token(page, "--dan-paper")).toBe("#f5eedc");
  expect(await token(page, "--dan-ink")).toBe("#1b1916");
  expect(await page.evaluate(() => document.documentElement.style.backgroundImage)).toBe("");
  await expect(page.getByRole("heading", { name: "Connect" })).toBeVisible();
});
