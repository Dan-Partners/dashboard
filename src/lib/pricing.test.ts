import { describe, expect, it } from "vitest";
import { checkAddons, checkOptions, amountLabel, percentText, plusPence, signedPence } from "./addons";
import { draftKey, mergeDraft, priceSlip } from "./create-order";
import { MockDanServer } from "./mock-server";
import { applyEdit, lineChanges } from "./order-edit";
import { lineDetail, lineSignature, lineTotal, price, share, type Channel } from "./pricing";
import { createSeedState } from "./seed";
import { billLines, ticketSections } from "./ticket";
import type { Addon, CreateOrderLine, MenuItem, OptionGroup } from "./types";

/**
 * The same cases, with the same figures, as the shop server's own tests in
 * `src/pricing.rs`. The server decides every bill; these prove the demo and
 * the previews work it out the same way.
 */

const choice = (id: string, name: string, pricePence: number) => ({ id, nameEn: name, nameZh: name, pricePence, allergens: [] });
const RICE_OPTIONS: OptionGroup[] = [
  { id: "size", nameEn: "Size", nameZh: "大小", kind: "one", choices: [choice("regular", "Regular", 0), choice("large", "Large", 150)] },
  { id: "extras", nameEn: "Extras", nameZh: "加料", kind: "any", choices: [choice("chilli", "Extra chilli", 0), choice("egg", "Extra egg", 80), choice("no-peas", "No peas", -20)] },
];
/** The demo menu, where egg fried rice (81, £3.90) comes in two sizes and takes extras. */
function menu(): MenuItem[] {
  return createSeedState(new Date("2026-11-27T12:00:00Z")).items.map((item) => (item.number === 81 ? { ...item, options: RICE_OPTIONS } : item));
}
const addon = (id: string, scope: Addon["scope"], kind: Addon["kind"], value: number, more: Partial<Addon> = {}): Addon => ({
  id,
  nameEn: id,
  nameZh: id,
  scope,
  kind,
  value,
  auto: false,
  required: false,
  channels: "both",
  ...more,
});
const wanted = (number: number, qty: number, options: string[], addons?: string[]): CreateOrderLine => ({ number, qty, options, ...(addons ? { addons } : {}) });
const code = (run: () => unknown) => {
  try {
    run();
    return "ok";
  } catch (error) {
    return (error as { code?: string }).code ?? "?";
  }
};

describe("what an order comes to, by the server's rule", () => {
  it("rounds a percentage to the nearest penny, half away from nothing", () => {
    expect(share(1_000, 1_000)).toBe(100);
    // 10% of £3.95 is 39.5p: 40p on, 40p off.
    expect(share(395, 1_000)).toBe(40);
    expect(share(395, -1_000)).toBe(-40);
    // 12.5% of £10.03 is 125.375p.
    expect(share(1_003, 1_250)).toBe(125);
    expect(share(1_004, 1_250)).toBe(126);
    expect(share(0, 1_000)).toBe(0);
    expect(share(1, 4_999)).toBe(0);
    expect(share(1, 5_000)).toBe(1);
    expect(share(2_147_483_647, 10_000)).toBe(2_147_483_647);
  });

  it("adds options to the dish, and a choose-one group takes its first when none is named", () => {
    const items = menu();
    expect(items.find((item) => item.number === 81)!.pricePence).toBe(390);
    const plain = price([wanted(81, 2, [])], undefined, items, [], "local");
    expect(plain.lines[0].unitPricePence).toBe(390);
    expect(plain.lines[0].options!.map((option) => option.choiceId)).toEqual(["regular"]);
    expect(plain.totalPence).toBe(780);
    // Large, with an extra egg and no peas: 390 + 150 + 80 - 20, each.
    const dressed = price([wanted(81, 2, ["no-peas", "large", "egg"])], undefined, items, [], "local");
    const line = dressed.lines[0];
    expect(line.unitPricePence).toBe(600);
    expect(dressed.totalPence).toBe(1_200);
    // Recorded in the dish's own order, with what each added.
    expect(line.options!.map((option) => [option.choiceId, option.pricePence])).toEqual([
      ["large", 150],
      ["egg", 80],
      ["no-peas", -20],
    ]);
    expect(line.options![0].groupEn).toBe("Size");
    expect(lineDetail(line)).toBe("Large, Extra egg, No peas");
    expect(lineSignature(line)).toBe("81|egg,large,no-peas|");
    expect(lineSignature(line)).not.toBe(lineSignature(plain.lines[0]));

    const refused = (options: string[], number: number, from = items) => code(() => price([wanted(number, 1, options)], undefined, from, [], "local"));
    expect(refused(["regular", "large"], 81)).toBe("bad_options");
    expect(refused(["extra-large"], 81)).toBe("bad_options");
    // A dish with no options takes none.
    expect(refused(["large"], 1)).toBe("bad_options");
    // A choice cannot take a dish below nothing.
    const cheap = items.map((item) => (item.number === 81 ? { ...item, pricePence: 10 } : item));
    expect(refused(["no-peas"], 81, cheap)).toBe("invalid");
  });

  it("charges an add-on on a dish for each of the dish, or as a share of the line", () => {
    const all = [addon("box", "dish", "fixed", 10), addon("half", "dish", "percent", -5_000)];
    const priced = price([wanted(81, 3, ["large"], ["box", "half"])], undefined, menu(), all, "local");
    const sold = priced.lines[0];
    // Three large rice at £5.40: a box each (30p), and half off the dishes (£8.10).
    expect(sold.unitPricePence).toBe(540);
    expect(sold.addons!.map((applied) => [applied.id, applied.amountPence])).toEqual([
      ["box", 30],
      ["half", -810],
    ]);
    expect(lineTotal(sold)).toBe(1_620 + 30 - 810);
    expect(priced.totalPence).toBe(840);
    expect(lineDetail(sold)).toBe("Large, box, half");
  });

  it("works add-ons on the bill out on the lines, not on each other", () => {
    const all = [addon("service", "bill", "percent", 1_000), addon("offer", "bill", "percent", -1_000), addon("bag", "bill", "fixed", 10)];
    // Duck (1180) and two rice with egg (470 each) is 2120.
    const priced = price([wanted(1, 1, []), wanted(81, 2, ["egg"])], ["service", "offer", "bag"], menu(), all, "local");
    expect(priced.addons.map((applied) => [applied.id, applied.amountPence])).toEqual([
      ["service", 212],
      ["offer", -212],
      ["bag", 10],
    ]);
    expect(priced.totalPence).toBe(2_130);
    expect(priced.addons[0]).toMatchObject({ kind: "percent", value: 1_000 });
  });

  it("never takes a bill, or a dish, below nothing", () => {
    const all = [addon("five-off", "bill", "fixed", -500), addon("all-off", "bill", "percent", -10_000), addon("bag", "bill", "fixed", 10), addon("free", "dish", "fixed", -1_000)];
    // One rice at £3.90: £5 off stops at £3.90 off; 100% off then has nothing left; the bag still costs.
    const priced = price([wanted(81, 1, [], [])], ["five-off", "all-off", "bag"], menu(), all, "local");
    expect(priced.addons.map((applied) => applied.amountPence)).toEqual([-390, 0, 10]);
    expect(priced.totalPence).toBe(10);
    const dish = price([wanted(81, 1, [], ["free"])], [], menu(), all, "local");
    expect(dish.lines[0].addons![0].amountPence).toBe(-390);
    expect(lineTotal(dish.lines[0])).toBe(0);
    expect(dish.totalPence).toBe(0);
  });

  it("always applies required add-ons, and of the rest the ticked ones, or the defaults", () => {
    const all = [
      addon("service", "bill", "percent", 1_000, { required: true, auto: true }),
      addon("bag", "bill", "fixed", 10, { auto: true }),
      addon("tip", "bill", "fixed", 100),
      addon("staff", "bill", "percent", -2_000, { channels: "local" }),
      addon("web-fee", "bill", "fixed", 25, { channels: "online", required: true, auto: true }),
    ];
    const applied = (ticked: string[] | undefined, channel: Channel) => price([wanted(81, 1, [])], ticked, menu(), all, channel).addons.map((entry) => entry.id);
    // Nothing named: the required one and the ones ticked by default, for that kind of order.
    expect(applied(undefined, "local")).toEqual(["service", "bag"]);
    expect(applied(undefined, "online")).toEqual(["service", "bag", "web-fee"]);
    // Named: exactly those, and the required ones whatever was named.
    expect(applied(["tip"], "local")).toEqual(["service", "tip"]);
    expect(applied([], "local")).toEqual(["service"]);
    expect(applied([], "online")).toEqual(["service", "web-fee"]);
    expect(applied(["staff", "bag"], "local")).toEqual(["service", "bag", "staff"]);
    // A customer cannot give themselves the staff discount, and nobody can name one that is not there.
    expect(code(() => applied(["staff"], "online"))).toBe("bad_addon");
    expect(code(() => applied(["web-fee"], "local"))).toBe("bad_addon");
    expect(code(() => applied(["nothing"], "local"))).toBe("bad_addon");
  });

  it("needs a dish that is on sale, in a sensible quantity", () => {
    const items = menu();
    const refused = (lines: CreateOrderLine[], from = items) => code(() => price(lines, undefined, from, [], "local"));
    expect(refused([])).toBe("invalid");
    expect(refused([wanted(81, 0, [])])).toBe("invalid");
    expect(refused([wanted(81, 100, [])])).toBe("invalid");
    expect(refused([wanted(9_999, 1, [])])).toBe("unknown_item");
    expect(refused([wanted(81, 1, [])], items.map((item) => ({ ...item, soldOut: true })))).toBe("sold_out");
    expect(refused(Array.from({ length: 201 }, () => wanted(81, 1, [])))).toBe("invalid");
  });
});

describe("the owner's add-ons and a dish's options, checked as the server checks them", () => {
  it("tidies add-ons, and refuses one with no name, no amount or a borrowed id", () => {
    const tidy = checkAddons([addon(" service ", "bill", "percent", 1_000, { nameEn: " Service charge ", nameZh: "", required: true }), addon("bag", "bill", "fixed", 10, { nameEn: "", nameZh: "膠袋" })]);
    expect(tidy[0]).toMatchObject({ id: "service", nameEn: "Service charge", nameZh: "Service charge", auto: true, required: true });
    expect(tidy[1].nameEn).toBe("膠袋");
    const refused = (list: Addon[]) => code(() => checkAddons(list));
    expect(refused([addon("a", "bill", "fixed", 0)])).toBe("addons_amount");
    expect(refused([addon("a", "bill", "fixed", 100_001)])).toBe("addons_amount");
    expect(refused([addon("a", "bill", "percent", -10_001)])).toBe("addons_amount");
    expect(refused([addon("a", "bill", "percent", -10_000)])).toBe("ok");
    expect(refused([addon("A b", "bill", "fixed", 10)])).toBe("addons_ids");
    expect(refused([addon("a", "bill", "fixed", 10), addon("a", "bill", "fixed", 20)])).toBe("addons_ids");
    expect(refused([addon("a", "bill", "fixed", 10, { nameEn: " ", nameZh: "" })])).toBe("addons_name");
    expect(refused([addon("a", "bill", "fixed", 10, { nameEn: "x".repeat(41) })])).toBe("addons_name");
    expect(refused(Array.from({ length: 21 }, (_, n) => addon(`a${n}`, "bill", "fixed", 10)))).toBe("addons_size");
  });

  it("refuses options that could take a dish below nothing, and any on a set meal", () => {
    const dish = { kind: "item" as const, pricePence: 390 };
    expect(checkOptions(dish, RICE_OPTIONS)).toHaveLength(2);
    expect(checkOptions(dish, [])).toEqual([]);
    const refused = (item: { kind: "item" | "set"; pricePence: number }, groups: OptionGroup[]) => code(() => checkOptions(item, groups));
    expect(refused({ kind: "set", pricePence: 1_240 }, RICE_OPTIONS)).toBe("bad_options");
    // The cheapest size and every choice that takes off: 10 + 0 - 20 is below nothing.
    expect(refused({ kind: "item", pricePence: 10 }, RICE_OPTIONS)).toBe("bad_options");
    expect(refused(dish, [{ ...RICE_OPTIONS[0], choices: [] }])).toBe("bad_options");
    expect(refused(dish, [RICE_OPTIONS[0], { ...RICE_OPTIONS[1], id: "size" }])).toBe("bad_options");
    // A choice's id is its own within the dish, across groups too.
    expect(refused(dish, [RICE_OPTIONS[0], { ...RICE_OPTIONS[1], choices: [choice("large", "Large again", 0)] }])).toBe("bad_options");
    expect(refused(dish, [{ ...RICE_OPTIONS[0], nameEn: "", nameZh: "" }])).toBe("bad_options");
  });

  it("writes amounts the way people read them", () => {
    expect(signedPence(-200)).toBe("-£2.00");
    expect(plusPence(150)).toBe("+£1.50");
    expect(plusPence(0)).toBe("");
    expect(percentText(1_250)).toBe("12.5%");
    expect(amountLabel({ kind: "percent", value: -1_000 })).toBe("-10%");
    expect(amountLabel({ kind: "fixed", value: 10 })).toBe("+£0.10");
  });
});

describe("the slip staff build, priced before it is sent", () => {
  const all = [
    addon("service", "bill", "percent", 1_000, { nameEn: "Service charge", required: true, auto: true }),
    addon("bag", "bill", "fixed", 10, { nameEn: "Carrier bag" }),
    addon("web", "bill", "percent", -500, { channels: "online", auto: true }),
    addon("sauce", "dish", "fixed", 50, { nameEn: "Extra sauce" }),
  ];

  it("keeps the same dish taken two ways as two lines, and adds up like the server", () => {
    let slip = mergeDraft([], { number: 81, qty: 1, options: ["large", "egg"], addons: ["sauce"] });
    slip = mergeDraft(slip, { number: 81, qty: 1, options: ["egg", "large"], addons: ["sauce"] });
    slip = mergeDraft(slip, { number: 81, qty: 1, options: ["regular"], addons: [] });
    expect(slip.map((line) => line.qty)).toEqual([2, 1]);
    expect(draftKey(slip[0])).toBe("81|egg,large|sauce");

    const priced = priceSlip(slip, null, menu(), all);
    // Two large with egg at £6.20 and a sauce each, one regular; 10% service on £17.30; the online offer is not for staff.
    expect(priced.rows.map((row) => lineTotal(row.line!))).toEqual([1_340, 390]);
    expect(priced.addons.map((applied) => [applied.id, applied.amountPence])).toEqual([["service", 173]]);
    expect(priced.totalPence).toBe(1_903);
    expect(priced.input).toEqual({
      lines: [
        { number: 81, qty: 2, options: ["large", "egg"], addons: ["sauce"] },
        { number: 81, qty: 1, options: ["regular"], addons: [] },
      ],
      addons: ["service"],
    });
    // Ticking the bag; the required charge cannot be unticked.
    expect(priceSlip(slip, ["bag"], menu(), all).totalPence).toBe(1_913);
    expect(priceSlip(slip, [], menu(), all).billIds).toEqual(["service"]);
  });

  it("does not blank the bill when one dish has sold out since", () => {
    const items = menu().map((item) => (item.number === 1 ? { ...item, soldOut: true } : item));
    const priced = priceSlip(
      [
        { number: 1, qty: 1, options: [], addons: [] },
        { number: 81, qty: 1, options: ["regular"], addons: [] },
      ],
      [],
      items,
      [],
    );
    expect(priced.rows[0].problem?.code).toBe("sold_out");
    expect(priced.rows[1].line?.unitPricePence).toBe(390);
    expect(priced.totalPence).toBe(390);
  });

  it("sends plain lines from a shop with no options and no add-ons, as every shop server understands", () => {
    const plain = createSeedState(new Date("2026-11-27T12:00:00Z")).items;
    const priced = priceSlip([{ number: 81, qty: 2, options: [], addons: [] }], null, plain, []);
    expect(priced.input).toEqual({ lines: [{ number: 81, qty: 2 }] });
    expect(priced.totalPence).toBe(780);
  });
});

describe("the demo shop, with options and add-ons", () => {
  async function shop() {
    const server = new MockDanServer();
    const rice = (await server.getMenu()).items.find((item) => item.number === 81)!;
    await server.updateMenuItem(rice.id, { options: RICE_OPTIONS });
    await server.updateAddons([
      addon("service", "bill", "percent", 1_000, { nameEn: "Service charge", required: true }),
      addon("bag", "bill", "fixed", 10, { nameEn: "Carrier bag" }),
      addon("web", "bill", "percent", -500, { nameEn: "Web offer", channels: "online", auto: true }),
      addon("sauce", "dish", "fixed", 50, { nameEn: "Extra sauce" }),
    ]);
    return { server, rice };
  }
  const order = { source: "phone" as const, fulfilment: "collection" as const };

  it("prices an order like the shop server, and keeps it as sold when the menu changes", async () => {
    const { server, rice } = await shop();
    expect((await server.getAddons())[0].auto).toBe(true);
    const placed = await server.createOrder({ ...order, lines: [wanted(81, 2, ["large", "egg"], ["sauce"]), { number: 81, qty: 1 }] });
    expect(placed.lines.map((line) => [line.unitPricePence, lineTotal(line)])).toEqual([
      [620, 1_340],
      [390, 390],
    ]);
    expect(placed.addons).toEqual([{ id: "service", nameEn: "Service charge", nameZh: "service", kind: "percent", value: 1_000, amountPence: 173 }]);
    expect(placed.totalPence).toBe(1_903);
    // An online order gets the web offer by default; a staff order cannot have it.
    const online = await server.createOrder({ source: "online", fulfilment: "collection", lines: [{ number: 81, qty: 1 }] });
    expect(online.addons!.map((applied) => [applied.id, applied.amountPence])).toEqual([
      ["service", 39],
      ["web", -20],
    ]);
    await expect(server.createOrder({ ...order, lines: [{ number: 81, qty: 1 }], addons: ["web"] })).rejects.toMatchObject({ code: "bad_addon" });
    await expect(server.createOrder({ ...order, lines: [wanted(81, 1, ["jumbo"])] })).rejects.toMatchObject({ code: "bad_options" });
    await expect(server.updateMenuItem((await server.getMenu()).items.find((item) => item.number === 201)!.id, { options: RICE_OPTIONS })).rejects.toMatchObject({ code: "bad_options" });

    // The owner puts the service charge and the large size up: the order already taken keeps what it was sold at.
    await server.updateAddons((await server.getAddons()).map((entry) => (entry.id === "service" ? { ...entry, value: 1_250 } : entry)));
    await server.updateMenuItem(rice.id, { options: [{ ...RICE_OPTIONS[0], choices: [choice("regular", "Regular", 0), choice("large", "Large", 200)] }, RICE_OPTIONS[1]] });
    const edited = await server.editOrder(placed.id, {
      lines: [wanted(81, 3, ["large", "egg"], ["sauce"]), wanted(81, 1, ["regular"], []), wanted(81, 1, ["large"], [])],
    });
    expect(edited.lines.map((line) => [line.unitPricePence, lineTotal(line)])).toEqual([
      [620, 2_010],
      [390, 390],
      [590, 590],
    ]);
    // 10% as it was applied, on the new dishes (2990).
    expect(edited.addons!.map((applied) => applied.amountPence)).toEqual([299]);
    expect(edited.totalPence).toBe(2_990 + 299);

    // Only afterwards, the owner takes the required charge off and puts the bag on. It is recorded.
    const swapped = await server.editOrder(placed.id, { addons: ["bag"] });
    expect(swapped.addons!.map((applied) => [applied.id, applied.amountPence])).toEqual([["bag", 10]]);
    expect(swapped.totalPence).toBe(3_000);
    expect(swapped.editCount).toBe(2);
    expect((await server.editOrder(placed.id, { addons: ["bag"] })).editCount).toBe(2);
    await expect(server.editOrder(placed.id, { addons: ["sauce"] })).rejects.toMatchObject({ code: "bad_addon" });
    const record = await server.getOrderEdits(placed.id);
    expect(record[0].lines).toEqual([
      { number: 81, nameEn: "Egg fried rice", nameZh: "蛋炒飯", detail: "Large, Extra egg, Extra sauce", beforeQty: 2, afterQty: 3 },
      { number: 81, nameEn: "Egg fried rice", nameZh: "蛋炒飯", detail: "Large", beforeQty: 0, afterQty: 1 },
    ]);
    expect(record[1].changes).toEqual([{ field: "addons", before: "Service charge", after: "Carrier bag" }]);
    expect([record[1].totalBeforePence, record[1].totalAfterPence]).toEqual([3_289, 3_000]);
  });

  it("shows what was chosen on the ticket, and the bill's add-ons above the total", async () => {
    const { server } = await shop();
    const placed = await server.createOrder({ ...order, lines: [wanted(81, 1, ["large"], ["sauce"]), wanted(81, 1, ["large"], ["sauce"]), wanted(81, 1, [], []), wanted(201, 1, [], ["sauce"])] });
    const rice = ticketSections(placed, (await server.getStations())).flatMap((section) => section.lines).filter((line) => line.number === 81);
    expect(rice.map((line) => [line.qty, line.details.map((detail) => `${detail.addon ? "+ " : ""}${detail.nameEn}`)])).toEqual([
      // Two taken the same way are one line of two.
      [2, ["Large", "+ Extra sauce"]],
      [1, ["Regular"]],
      // The set meal's rice, with what was put on the set.
      [1, ["+ Extra sauce"]],
    ]);
    expect(billLines(placed)).toEqual([{ id: "service", nameEn: "Service charge", nameZh: "service", rate: "10%", amount: "£2.86" }]);
  });

  it("tells one line of a dish from another in the record", () => {
    const [plain] = price([wanted(81, 1, [])], undefined, menu(), [], "local").lines;
    const [large] = price([wanted(81, 2, ["large"])], undefined, menu(), [], "local").lines;
    expect(lineChanges([plain], [plain, large]).map((change) => [change.detail, change.beforeQty, change.afterQty])).toEqual([["Large", 0, 2]]);
    expect(lineChanges([plain, large], [large])).toMatchObject([{ detail: "Regular", beforeQty: 1, afterQty: 0 }]);
    // An order from before options has no detail, and is still told apart by its dish.
    const old = { ...plain, options: undefined, addons: undefined };
    expect(applyEdit({ id: "o", number: 1, createdAt: "", source: "counter", fulfilment: "collection", status: "new", customerName: "", phone: "", address: "", notes: "", lines: [old], totalPence: 390 }, { lines: [{ number: 81, qty: 2 }] }, menu(), [], false).order.totalPence).toBe(780);
  });
});
