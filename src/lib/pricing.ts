import { DanError } from "./errors";
import type { Addon, AppliedAddon, ChosenOption, CreateOrderLine, MenuItem, OrderLine, TicketComponent } from "./types";

/**
 * What an order comes to. The shop server decides (`src/pricing.rs` there);
 * this file is the same rule, step for step, for the demo and for showing
 * staff a bill before it is sent. If the two ever disagree, the server is
 * right: an order's own figures always come from it.
 *
 * 1. A dish costs its menu price plus the prices of the options chosen. In a
 *    "choose one" group with nothing chosen, the first choice is taken.
 * 2. Add-ons on a dish are worked out on that line: a fixed amount once for
 *    each of the dish, a percentage on the line's dishes.
 * 3. Add-ons on the bill are worked out on the sum of the lines: a fixed
 *    amount once, a percentage of that sum. Never on the delivery fee, never
 *    on another bill add-on.
 * 4. A percentage is rounded to the nearest penny, half a penny away from zero.
 * 5. Add-ons apply in the owner's order, and none takes a line or a bill
 *    below nothing.
 */

export const MAX_LINES = 200;
export const MAX_QTY = 99;

/** Where an order is being created: by a customer online, or by staff. */
export type Channel = "online" | "local";

export type Priced = { lines: OrderLine[]; addons: AppliedAddon[]; totalPence: number };

/** A share of an amount, to the nearest penny, half a penny away from zero. `percent` is hundredths of a percent. */
export function share(base: number, percent: number): number {
  const exact = base * percent;
  return Math.trunc((exact + (exact >= 0 ? 5_000 : -5_000)) / 10_000) || 0;
}

/** Works add-ons out on a base amount, in order. `times`: how many of a dish a fixed amount is charged for (1 for a bill). */
export function apply(base: number, times: number, addons: AppliedAddon[]): AppliedAddon[] {
  let running = Math.max(base, 0);
  return addons.map((addon) => {
    const wanted = addon.kind === "fixed" ? addon.value * times : share(base, addon.value);
    // A promotion stops at nothing owed.
    // `|| 0`: taking nothing off is 0, never JavaScript's minus zero.
    const amountPence = Math.max(wanted, -running) || 0;
    running += amountPence;
    return { ...addon, amountPence };
  });
}

/** An add-on as it goes on an order, before its amount is worked out. */
export function asApplied(addon: Addon): AppliedAddon {
  return { id: addon.id, nameEn: addon.nameEn, nameZh: addon.nameZh, kind: addon.kind, value: addon.value, amountPence: 0 };
}

const covers = (addon: Addon, channel: Channel) => addon.channels === "both" || addon.channels === channel;

/** The add-ons offered for one scope where an order is being created. */
export function offered(all: Addon[], scope: Addon["scope"], channel: Channel): Addon[] {
  return all.filter((addon) => addon.scope === scope && covers(addon, channel));
}

/**
 * The add-ons that apply, of one scope. `ticked`: the ids named by whoever
 * creates the order; undefined when they named none at all, which means the
 * ones ticked by default. A required one always applies.
 */
export function chosen(all: Addon[], scope: Addon["scope"], channel: Channel, ticked?: string[]): Addon[] {
  const open = offered(all, scope, channel);
  const unknown = ticked?.find((id) => !open.some((addon) => addon.id === id));
  if (unknown !== undefined) throw new DanError("bad_addon", `The add-on ${unknown} is not offered on this order.`);
  return open.filter((addon) => addon.required || (ticked ? ticked.includes(addon.id) : addon.auto));
}

/** The options chosen for a dish, in the dish's own order, checked. */
export function optionsFor(item: MenuItem, wanted: string[]): ChosenOption[] {
  const groups = item.options ?? [];
  const unknown = wanted.find((id) => !groups.some((group) => group.choices.some((choice) => choice.id === id)));
  if (unknown !== undefined) throw new DanError("bad_options", `${item.number} ${item.nameEn} has no option ${unknown}.`);
  return groups.flatMap((group) => {
    let picked = group.choices.filter((choice) => wanted.includes(choice.id));
    if (group.kind === "one") {
      if (picked.length > 1) throw new DanError("bad_options", `Choose one ${group.nameEn} for ${item.number} ${item.nameEn}.`);
      // Nothing named: the first choice, the one shown ticked.
      if (picked.length === 0) picked = group.choices.slice(0, 1);
    }
    return picked.map((choice) => ({
      groupId: group.id,
      choiceId: choice.id,
      groupEn: group.nameEn,
      groupZh: group.nameZh,
      nameEn: choice.nameEn,
      nameZh: choice.nameZh,
      pricePence: choice.pricePence,
    }));
  });
}

/** A set meal's dishes, for the kitchen. */
export function componentsFor(item: MenuItem, menu: MenuItem[], qty: number): TicketComponent[] {
  return item.includes.map((include) => {
    const part = menu.find((entry) => entry.number === include.number);
    if (!part) throw new DanError("bad_item", `Set ${item.number} refers to a missing dish.`);
    if (part.soldOut) throw new DanError("sold_out", `${part.number} ${part.nameEn} is sold out.`);
    return { number: part.number, nameEn: part.nameEn, nameZh: part.nameZh, qty: include.qty * qty, station: part.station };
  });
}

/** One line of an order as the menu has the dish now, with the options chosen. Its add-ons are put on by `withAddons`. */
export function lineFromMenu(number: number, qty: number, options: string[], menu: MenuItem[]): OrderLine {
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) throw new DanError("invalid", "Quantity must be between 1 and 99.");
  const item = menu.find((entry) => entry.number === number);
  if (!item) throw new DanError("unknown_item", `No dish with number ${number}.`);
  if (item.soldOut) throw new DanError("sold_out", `${item.number} ${item.nameEn} is sold out.`);
  const picked = optionsFor(item, options);
  const unitPricePence = item.pricePence + picked.reduce((sum, option) => sum + option.pricePence, 0);
  if (unitPricePence < 0) throw new DanError("invalid", "Those options take the dish below nothing.");
  return {
    itemId: item.id,
    number: item.number,
    nameEn: item.nameEn,
    nameZh: item.nameZh,
    qty,
    unitPricePence,
    station: item.station,
    kind: item.kind,
    components: item.kind === "set" ? componentsFor(item, menu, qty) : [],
    options: picked,
    addons: [],
  };
}

/** Puts add-ons on a line, worked out on its dishes. */
export function withAddons(line: OrderLine, addons: AppliedAddon[]): OrderLine {
  return { ...line, addons: apply(line.qty * line.unitPricePence, line.qty, addons) };
}

/** What a line comes to: the dishes (options included) and its add-ons. */
export function lineTotal(line: Pick<OrderLine, "qty" | "unitPricePence" | "addons">): number {
  return line.qty * line.unitPricePence + (line.addons ?? []).reduce((sum, addon) => sum + addon.amountPence, 0);
}

/** What tells one line of a dish from another: its choices and its add-ons. */
export function lineSignature(line: Pick<OrderLine, "number" | "options" | "addons">): string {
  const choices = (line.options ?? []).map((option) => option.choiceId).sort();
  const addons = (line.addons ?? []).map((addon) => addon.id).sort();
  return `${line.number}|${choices.join(",")}|${addons.join(",")}`;
}

/** The chosen options and add-ons in words, for a record: "Large, Extra chilli". */
export function lineDetail(line: Pick<OrderLine, "options" | "addons">): string {
  return [...(line.options ?? []).map((option) => option.nameEn), ...(line.addons ?? []).map((addon) => addon.nameEn)].join(", ");
}

/** What a set of lines comes to with add-ons on the bill, before any delivery fee. */
export function bill(lines: OrderLine[], addons: AppliedAddon[]): Priced {
  const dishes = lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const applied = apply(dishes, 1, addons);
  const totalPence = dishes + applied.reduce((sum, addon) => sum + addon.amountPence, 0);
  if (totalPence < 0 || totalPence > 2_147_483_647) throw new DanError("invalid", "That order is too large.");
  return { lines, addons: applied, totalPence };
}

/** Prices a new order: the dishes asked for, with their options, and the add-ons that apply where it is being created. */
export function price(lines: CreateOrderLine[], billAddons: string[] | undefined, menu: MenuItem[], all: Addon[], channel: Channel): Priced {
  if (lines.length === 0) throw new DanError("invalid", "Add a dish before sending.");
  if (lines.length > MAX_LINES) throw new DanError("invalid", "That order has too many lines.");
  const priced = lines.map((wanted) =>
    withAddons(lineFromMenu(wanted.number, wanted.qty, wanted.options ?? [], menu), chosen(all, "dish", channel, wanted.addons).map(asApplied)),
  );
  return bill(priced, chosen(all, "bill", channel, billAddons).map(asApplied));
}
