import { expect, test, type Page } from "@playwright/test";

/*
 * Ticket sounds in the demo (kept in this browser). The pages record what
 * they play in window.__danSounds; the tests read that.
 */
const played = (page: Page) => page.evaluate(() => ((window as unknown as { __danSounds?: { key: string; sound: string; place: string }[] }).__danSounds ?? []).slice());

/** Another tab on the same device puts an online order on the board, as the demo's own timer would. */
async function arrive(page: Page, number: number) {
  await page.evaluate((n) => {
    const state = JSON.parse(localStorage.getItem("dan.v1")!);
    const now = new Date().toISOString();
    state.demoState.orders.unshift({
      id: `e2e-${n}`, number: n, createdAt: now, source: "online", fulfilment: "collection", status: "new",
      customerName: "Test", phone: "", address: "", notes: "", table: null, totalPence: 390, payment: { method: "card", status: "paid" },
      lines: [{ itemId: "item-81", number: 81, nameEn: "Egg fried rice", nameZh: "蛋炒飯", qty: 1, unitPricePence: 390, station: "rice", kind: "dish", components: [] }],
      column: "new", columnAt: now,
    });
    localStorage.setItem("dan.v1", JSON.stringify(state));
  }, number);
}

test("the kitchen 叮 plays once per new ticket, once per tablet, and never on a reload; pass and counter stay quiet", async ({ context }) => {
  const kitchen = await context.newPage();
  await kitchen.goto("/");
  await kitchen.evaluate(() => localStorage.clear());
  await kitchen.goto("/shop/orders?demo=1");
  await expect(kitchen.getByRole("heading", { name: "Orders" })).toBeVisible();
  // The counter has no sound by default: no control offered there.
  await expect(kitchen.getByTestId("sounds-off")).toHaveCount(0);
  await kitchen.goto("/shop/kitchen");
  await expect(kitchen.getByTestId("sounds-off")).toContainText("Ticket sounds are off on this screen");
  await kitchen.getByTestId("sounds-enable").click();
  await expect(kitchen.getByTestId("sounds-on")).toHaveAttribute("data-unlocked", "true");

  // A second kitchen view on the same tablet, and the pass.
  const second = await context.newPage();
  await second.goto("/shop/kitchen");
  await second.getByTestId("sounds-on").click();
  await expect(second.getByTestId("sounds-on")).toHaveAttribute("data-unlocked", "true");
  const pass = await context.newPage();
  await pass.goto("/shop/pass");
  await expect(pass.getByTestId("sounds-off")).toHaveCount(0);

  // Two tickets arrive together: two 叮, 400 ms apart, on one of the two kitchen tabs only.
  const writer = await context.newPage();
  await writer.goto("/shop/menu");
  await arrive(writer, 9001);
  await arrive(writer, 9002);
  await expect(async () => {
    const all = [...(await played(kitchen)), ...(await played(second))];
    expect(all.map((entry) => entry.key.split("|")[0]).sort()).toEqual(["e2e-9001", "e2e-9002"]);
    expect(all.every((entry) => entry.sound === "ding" && entry.place === "kitchen")).toBe(true);
  }).toPass({ timeout: 10_000 });
  expect(await played(pass)).toEqual([]);

  // A reload replays nothing; the choice to hear sounds is kept.
  await kitchen.reload();
  await expect(kitchen.getByTestId("sounds-on")).toBeVisible();
  await kitchen.mouse.click(5, 5);
  await kitchen.waitForTimeout(1500);
  expect(await played(kitchen)).toEqual([]);
});

test("the owner adds a sound for a column kind; a board change that moves tickets stays quiet; reset brings back only the 叮", async ({ context }) => {
  const owner = await context.newPage();
  await owner.goto("/");
  await owner.evaluate(() => localStorage.clear());
  await owner.goto("/shop/orders?demo=1");
  await expect(owner.getByRole("heading", { name: "Orders" })).toBeVisible();

  // A chime in the kitchen when a ticket enters any in-progress column, and a Packing column.
  await owner.goto("/shop/settings/flow");
  await owner.getByRole("button", { name: "Add a sound" }).click();
  await owner.getByLabel("When 2").selectOption("role:in_progress");
  await owner.getByLabel("Kitchen 2").check();
  await owner.getByLabel("Pass 2").uncheck();
  await owner.getByRole("button", { name: "Save sounds" }).click();
  await expect(owner.getByTestId("sounds-message")).toHaveText("Sounds saved. Every tablet follows.");
  await owner.getByRole("button", { name: "Add a column" }).click();
  await owner.getByLabel("English name 3").fill("Packing");
  await owner.getByRole("button", { name: "Save board" }).click();
  await expect(owner.getByTestId("board-message")).toHaveText("Board saved. Every tablet follows.");
  await owner.reload();
  await expect(owner.getByLabel("When 2")).toHaveValue("role:in_progress");

  const kitchen = await context.newPage();
  await kitchen.goto("/shop/kitchen");
  await kitchen.getByTestId("sounds-enable").click();
  await expect(kitchen.getByTestId("sounds-on")).toHaveAttribute("data-unlocked", "true");

  // Staff move a ticket into Packing on the counter: the kitchen hears the chime.
  await owner.goto("/shop/orders");
  const ticket = owner.locator("section[data-column='preparing'] article").first();
  const number = (await ticket.getByTestId("docket-number").textContent())!;
  await ticket.getByRole("button", { name: "Move to Packing" }).click();
  await expect(async () => expect((await played(kitchen)).map((entry) => entry.sound)).toEqual(["chime"])).toPass({ timeout: 10_000 });

  // The owner removes Packing: the ticket moves back to Preparing (in progress), silently.
  await owner.goto("/shop/settings/flow");
  await owner.getByRole("button", { name: "Remove column 3" }).click();
  await owner.getByRole("button", { name: "Save board" }).click();
  await owner.getByRole("button", { name: "Save and move them" }).click();
  await expect(owner.getByTestId("board-message")).toHaveText("Board saved. Every tablet follows.");
  await expect(kitchen.getByTestId("kitchen-ticket").filter({ hasText: number })).toHaveAttribute("aria-label", /Preparing/);
  await kitchen.waitForTimeout(1500);
  expect((await played(kitchen)).map((entry) => entry.sound)).toEqual(["chime"]);

  // Reset asks for a second tap, then only the kitchen 叮 is left.
  await owner.getByTestId("sounds-reset").click();
  await expect(owner.getByTestId("sounds-reset")).toHaveText("Tap again to confirm");
  await owner.getByTestId("sounds-reset").click();
  await expect(owner.getByTestId("sounds-message")).toHaveText("Sounds are back to the kitchen 叮 only.");
  await expect(owner.getByTestId("sound-list").locator("li")).toHaveCount(1);
  await expect(owner.getByLabel("When 1")).toHaveValue("role:incoming");
});
