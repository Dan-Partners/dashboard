import { expect, test } from "@playwright/test";

test("Tools makes a QR card per table, for the shop's ordering address", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.goto("/shop/orders?demo=1");
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();

  // At the bottom of the menu, for everyone.
  const links = page.getByRole("navigation", { name: "Dan" }).first().getByRole("link");
  await expect(links.last()).toHaveText(/^Tools/);
  await links.last().click();
  await expect(page.getByRole("heading", { name: "Table QR codes" })).toBeVisible();

  // The demo's address is filled in; a shop's own domain can replace it, and is kept.
  const address = page.getByLabel("Ordering address");
  await expect(address).toHaveValue("https://order.dan.partners");
  await address.fill("order.goldendragon.co.uk/menu");
  await address.blur();
  await expect(address).toHaveValue("https://order.goldendragon.co.uk");

  await page.getByLabel("Tables").fill("1-3, A1");
  const cards = page.getByTestId("qr-card");
  await expect(cards).toHaveCount(4);
  await expect(page.getByTestId("qr-count")).toHaveText("4 cards");
  await expect(cards.nth(3)).toContainText("A1");
  await expect(cards.nth(3).locator("svg")).toHaveAttribute("data-qr", "https://order.goldendragon.co.uk/?table=A1");

  // Mistakes are said plainly, and nothing prints.
  await page.getByLabel("Tables").fill("5-2");
  await expect(page.getByText('"5-2" runs backwards.')).toBeVisible();
  await expect(page.getByRole("button", { name: /^Print/ })).toBeDisabled();
  await address.fill("http://order.example");
  await expect(page.getByText("The ordering address starts with https://")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Ordering address")).toHaveValue("https://order.goldendragon.co.uk");
});
