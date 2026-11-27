import { DanError } from "./errors";
import { asApplied, bill, lineFromMenu, offered, withAddons } from "./pricing";
import type { Addon, AppliedAddon, Category, CreateOrderInput, MenuItem, OrderLine } from "./types";
import type { View } from "./views";

/**
 * A shop has a kitchen when one of its views is a "make" view. Then an order
 * is "sent to the kitchen"; a shop without one "places" it.
 */
export function hasKitchen(views: Pick<View, "look">[]): boolean {
  return views.some((view) => view.look === "make");
}

/**
 * The dishes the menu picker shows. A search (part of a name in either
 * language, or a dish number) looks through the whole menu; otherwise the
 * chosen category, or everything. In the menu's own order: by category,
 * then by number.
 */
export function dishesFor(items: MenuItem[], categories: Category[], categoryId: string | null, search: string): MenuItem[] {
  const order = new Map(categories.map((category, index) => [category.id, index]));
  const sorted = [...items].sort((a, b) => (order.get(a.categoryId) ?? 999) - (order.get(b.categoryId) ?? 999) || a.number - b.number);
  const text = search.trim().toLowerCase();
  if (text) {
    if (/^\d+$/.test(text)) {
      // The dish with that number first, then numbers that start with it.
      return sorted.filter((item) => String(item.number).startsWith(text)).sort((a, b) => Number(String(b.number) === text) - Number(String(a.number) === text));
    }
    return sorted.filter((item) => item.nameEn.toLowerCase().includes(text) || item.nameZh.toLowerCase().includes(text));
  }
  return categoryId ? sorted.filter((item) => item.categoryId === categoryId) : sorted;
}

/** A line on the slip before it is sent: the dish, how many, and the ids of the choices and add-ons taken for it. */
export type Draft = { number: number; qty: number; options: string[]; addons: string[] };

/** What tells one line of the slip from another: the dish, and how it is taken. */
export function draftKey(draft: Pick<Draft, "number" | "options" | "addons">): string {
  return `${draft.number}|${[...draft.options].sort().join(",")}|${[...draft.addons].sort().join(",")}`;
}

/** Puts a line on the slip: more of a line already there taken the same way, or a new line. */
export function mergeDraft(lines: Draft[], next: Draft): Draft[] {
  const key = draftKey(next);
  if (lines.some((line) => draftKey(line) === key)) {
    return lines.map((line) => (draftKey(line) === key ? { ...line, qty: Math.min(99, line.qty + next.qty) } : line));
  }
  return [...lines, next];
}

export type SlipRow = {
  key: string;
  draft: Draft;
  item: MenuItem | undefined;
  /** The line priced; null when it cannot be (the dish has gone, or sold out since). */
  line: OrderLine | null;
  problem: { code: string | undefined; message: string } | null;
};

export type Slip = {
  rows: SlipRow[];
  /** The bill add-ons that apply, with what each comes to. */
  addons: AppliedAddon[];
  /** The ids of the bill add-ons ticked, required ones included. */
  billIds: string[];
  totalPence: number;
  /** The dishes and add-ons as `createOrder` takes them. */
  input: Pick<CreateOrderInput, "lines" | "addons">;
};

/**
 * The slip priced for staff, by the server's own rule (./pricing.ts). Each
 * line is priced by itself, so one dish that has sold out since does not
 * blank the bill. `billTicked` null: the bill add-ons ticked by default.
 *
 * A shop with no options and no add-ons sends plain lines (a dish and how
 * many), as every shop server understands. Otherwise each line says exactly
 * what was chosen, so the server never has to guess.
 */
export function priceSlip(drafts: Draft[], billTicked: string[] | null, menu: MenuItem[], all: Addon[]): Slip {
  const dishAddons = offered(all, "dish", "local");
  const billAddons = offered(all, "bill", "local");
  const rows: SlipRow[] = drafts.map((draft) => {
    const item = menu.find((entry) => entry.number === draft.number);
    try {
      const fresh = lineFromMenu(draft.number, draft.qty, draft.options, menu);
      const onDish = dishAddons.filter((addon) => addon.required || draft.addons.includes(addon.id));
      return { key: draftKey(draft), draft, item, line: withAddons(fresh, onDish.map(asApplied)), problem: null };
    } catch (error) {
      return { key: draftKey(draft), draft, item, line: null, problem: { code: error instanceof DanError ? error.code : undefined, message: error instanceof Error ? error.message : "" } };
    }
  });
  const onBill = billAddons.filter((addon) => addon.required || (billTicked ? billTicked.includes(addon.id) : addon.auto));
  const priced = bill(
    rows.flatMap((row) => (row.line ? [row.line] : [])),
    onBill.map(asApplied),
  );
  const explicit = all.length > 0 || menu.some((item) => (item.options?.length ?? 0) > 0);
  return {
    rows,
    addons: priced.addons,
    billIds: onBill.map((addon) => addon.id),
    totalPence: priced.totalPence,
    input: explicit
      ? {
          lines: rows.map(({ draft, line }) => ({
            number: draft.number,
            qty: draft.qty,
            options: line?.options?.map((option) => option.choiceId) ?? draft.options,
            addons: line?.addons?.map((addon) => addon.id) ?? draft.addons,
          })),
          addons: onBill.map((addon) => addon.id),
        }
      : { lines: drafts.map((draft) => ({ number: draft.number, qty: draft.qty })) },
  };
}
