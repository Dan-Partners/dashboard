import { execSync } from "node:child_process";
import { openSettings, STAFF_NAME } from "./settings";
import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { openTill } from "./create-order";

/**
 * Printing on the shop's network printers, end to end: the owner adds a
 * printer in Tools, a test print and every new order come out of it, a
 * printer that stops answering is shown on the tablet until Retry now,
 * Reprint prints again, a change to an order's dishes prints a ticket
 * marked CHANGED, and a cancel prints one marked CANCELLED.
 *
 * Opt in with a shop server (no other printers set up) and a fake receipt
 * printer that writes what it receives into a folder, with commands to stop
 * and start it:
 *
 *   DAN_E2E_SERVER_URL=… DAN_E2E_OWNER_EMAIL=… DAN_E2E_OWNER_PASSWORD=… DAN_E2E_PIN=… \
 *   DAN_E2E_PRINTER_PORT=9109 DAN_E2E_PRINTED_DIR=… DAN_E2E_PRINTER_STOP='…' DAN_E2E_PRINTER_START='…' \
 *   npx playwright test printing
 */
const server = process.env.DAN_E2E_SERVER_URL;
const ownerEmail = process.env.DAN_E2E_OWNER_EMAIL ?? "";
const ownerPassword = process.env.DAN_E2E_OWNER_PASSWORD ?? "";
const pin = process.env.DAN_E2E_PIN ?? "";
const port = process.env.DAN_E2E_PRINTER_PORT;
const printed = process.env.DAN_E2E_PRINTED_DIR;
const stopPrinter = process.env.DAN_E2E_PRINTER_STOP;
const startPrinter = process.env.DAN_E2E_PRINTER_START;

test.skip(!server || !port || !printed || !stopPrinter || !startPrinter, "Set the shop server and the fake printer to run this.");

/** Tickets the fake printer has received: each starts with ESC @. */
function tickets(): number {
  return fs
    .readdirSync(printed!)
    .map((file) => fs.readFileSync(`${printed}/${file}`))
    .reduce((sum, bytes) => sum + bytes.toString("latin1").split("\x1b@").length - 1, 0);
}

async function signIn(page: Page, who: "owner" | "pin") {
  await page.goto("/connect");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.dan === "ready");
  await page.getByLabel("Shop server").fill(server!);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  if (who === "owner") {
    await page.getByLabel("Email").fill(ownerEmail);
    await page.getByLabel("Password").fill(ownerPassword);
  } else {
    await page.getByRole("button", { name: "PIN", exact: true }).click();
    await page.getByLabel("Your name").fill(STAFF_NAME);
    await page.getByLabel("PIN").fill(pin);
  }
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
}

async function sell(page: Page) {
  await openTill(page);
  for (const key of ["8", "1"]) await page.getByRole("button", { name: key, exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Send to kitchen" }).click();
  await expect(page.getByText(/Sent to the kitchen/)).toBeVisible();
}

test.afterAll(() => {
  execSync(startPrinter!, { stdio: "inherit" });
});

test("the owner adds a printer; tests, new orders and reprints print; a silent printer is shown until it is back", async ({ page }) => {
  test.setTimeout(180_000);
  execSync(startPrinter!, { stdio: "inherit" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, "owner");
  await openSettings(page, "tables");
  const section = page.getByTestId("printers");
  // Start clean: printers left by an earlier run would print too.
  await expect(section.getByRole("button", { name: "Add a printer" })).toBeVisible();
  while ((await section.getByTestId("printer-row").count()) > 0) {
    const count = await section.getByTestId("printer-row").count();
    await section.getByTestId("printer-row").first().getByRole("button", { name: "Edit" }).click();
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByTestId("printer-form").getByRole("button", { name: "Remove" }).click();
    await expect(section.getByTestId("printer-row")).toHaveCount(count - 1);
  }
  await section.getByRole("button", { name: "Add a printer" }).click();
  const form = page.getByTestId("printer-form");
  await form.getByLabel("Name").fill("Kitchen");
  await form.getByLabel("Address on the shop's network").fill("8.8.8.8");
  await form.getByRole("button", { name: "Save printer" }).click();
  await expect(form.getByRole("alert")).toContainText("shop's own network");
  await form.getByLabel("Address on the shop's network").fill("127.0.0.1");
  await form.getByLabel("Port").fill(port!);
  await form.getByRole("button", { name: "Save printer" }).click();
  const row = section.getByTestId("printer-row").filter({ hasText: "Kitchen" });
  await expect(row).toContainText("127.0.0.1:" + port);
  await expect(row.getByTestId("printer-state")).toHaveText("Ready");

  const before = tickets();
  await row.getByRole("button", { name: "Test print" }).click();
  await expect(page.getByTestId("printers-notice")).toHaveText("Test print sent.");
  await expect.poll(tickets, { timeout: 10_000 }).toBe(before + 1);

  // Every new order prints by itself.
  await sell(page);
  await expect.poll(tickets, { timeout: 10_000 }).toBe(before + 2);

  // The owner changes that order's dishes: the kitchen gets a ticket marked CHANGED, once.
  const number = (await page.getByTestId("order-sent").textContent())!.match(/#(\d+)/)![1];
  await page.getByRole("link", { name: "← Back to orders" }).click();
  await page.locator("article").filter({ has: page.getByText(`#${number}`, { exact: true }) }).getByTestId("docket-edit").click();
  const editor = page.getByTestId("order-editor").filter({ visible: true });
  await editor.getByTestId("edit-add-search").fill("prawn toast");
  await editor.getByTestId("edit-add-dish").first().click();
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor.getByTestId("edit-status")).toHaveText("Saved. The change is in the record below.");
  await expect.poll(tickets, { timeout: 10_000 }).toBe(before + 3);
  // A change to the note alone is not news for the kitchen's printer.
  await editor.locator('input[name="edit-notes"]').fill("No MSG");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor.getByTestId("edit-status")).toHaveText("Saved. The change is in the record below.");
  await page.waitForTimeout(4_000);
  expect(tickets()).toBe(before + 3);
  // The owner cancels it while it is being made: the kitchen gets a ticket marked CANCELLED, once.
  const cancel = page.getByTestId("order-cancel").filter({ visible: true });
  await cancel.getByTestId("cancel-start").click();
  await cancel.getByTestId("cancel-confirm").click();
  await expect(page.getByTestId("order-cancelled-note").filter({ visible: true })).toBeVisible();
  await expect.poll(tickets, { timeout: 10_000 }).toBe(before + 4);

  // The printer stops answering: the tablet says so, Retry now prints once it is back.
  execSync(stopPrinter!, { stdio: "inherit" });
  await sell(page);
  const strip = page.getByTestId("print-strip");
  await expect(strip).toContainText("Kitchen · printer is not answering · 1 ticket waiting to print", { timeout: 25_000 });
  execSync(startPrinter!, { stdio: "inherit" });
  await strip.getByRole("button", { name: "Retry now" }).click();
  await expect.poll(tickets, { timeout: 10_000 }).toBe(before + 5);
  await expect(strip).toHaveCount(0, { timeout: 15_000 });

  // Reprint from the kitchen screen.
  await page.getByRole("link", { name: /^Kitchen/ }).first().click();
  await page.getByTestId("kitchen-ticket").first().getByTestId("reprint").click();
  await expect(page.getByTestId("kitchen-ticket").first().getByTestId("reprint")).toHaveText("Sent to the printer again.");
  await expect.poll(tickets, { timeout: 10_000 }).toBe(before + 6);

  // The counter PIN can test, not change printers.
  await signIn(page, "pin");
  await openSettings(page, "tables");
  await expect(section.getByTestId("printer-row")).toHaveCount(1);
  await expect(section.getByRole("button", { name: "Add a printer" })).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Edit" })).toHaveCount(0);

  // Tidy up: the owner removes it.
  await signIn(page, "owner");
  await openSettings(page, "tables");
  await section.getByTestId("printer-row").getByRole("button", { name: "Edit" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("printer-form").getByRole("button", { name: "Remove" }).click();
  await expect(section.getByText("No printers yet.")).toBeVisible();
});
