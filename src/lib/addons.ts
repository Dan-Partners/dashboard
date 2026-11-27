import { DanError } from "./errors";
import { formatPence } from "./format";
import { ALLERGENS, type Addon, type AppliedAddon, type MenuItem, type OptionGroup } from "./types";

/**
 * The shop's add-ons and a dish's options: the server's checks, with its
 * codes, for the demo and for telling the owner what is wrong before a save.
 * How they turn into money is in ./pricing.ts.
 */

export const MAX_ADDONS = 20;
export const MAX_ADDON_NAME = 40;
/** The largest fixed amount, either way: £1,000. */
export const MAX_FIXED_PENCE = 100_000;
/** The largest percentage, either way: 100%, in hundredths of a percent. */
export const MAX_PERCENT = 10_000;
export const MAX_OPTION_GROUPS = 8;
export const MAX_OPTION_CHOICES = 20;
export const MAX_OPTION_NAME = 40;

const ID = /^[a-z0-9_-]{1,32}$/;

/** Two names tidied: one given alone is used for both. Null when there is none, or one is too long. */
function names(en: string, zh: string, limit: number): [string, string] | null {
  const a = en.trim();
  const b = zh.trim();
  if (!a && !b) return null;
  const pair: [string, string] = [a || b, b || a];
  return [...pair[0]].length > limit || [...pair[1]].length > limit ? null : pair;
}

/** The owner's add-ons checked and tidied. */
export function checkAddons(list: Addon[]): Addon[] {
  if (list.length > MAX_ADDONS) throw new DanError("addons_size", `Up to ${MAX_ADDONS} add-ons.`);
  const seen = new Set<string>();
  return list.map((addon) => {
    const id = addon.id.trim();
    if (!ID.test(id) || seen.has(id)) throw new DanError("addons_ids", "Each add-on needs its own id.");
    seen.add(id);
    const named = names(addon.nameEn, addon.nameZh, MAX_ADDON_NAME);
    if (!named) throw new DanError("addons_name", `Each add-on needs a name of up to ${MAX_ADDON_NAME} characters.`);
    const scope = addon.scope === "dish" ? "dish" : "bill";
    const kind = addon.kind === "percent" ? "percent" : "fixed";
    const limit = kind === "fixed" ? MAX_FIXED_PENCE : MAX_PERCENT;
    if (!Number.isInteger(addon.value) || addon.value === 0 || Math.abs(addon.value) > limit) {
      throw new DanError("addons_amount", "An add-on needs an amount: up to £1,000, or up to 100%, and not nothing.");
    }
    const required = Boolean(addon.required);
    const channels = addon.channels === "online" || addon.channels === "local" ? addon.channels : "both";
    // A required add-on is always on, so it is ticked by default too.
    return { id, nameEn: named[0], nameZh: named[1], scope, kind, value: addon.value, auto: Boolean(addon.auto) || required, required, channels };
  });
}

/** A saved list that cannot be read is treated as not there. */
export function normalizeAddons(value: unknown): Addon[] {
  if (!Array.isArray(value)) return [];
  try {
    return checkAddons(value as Addon[]);
  } catch {
    return [];
  }
}

/** A dish's options checked and tidied: no way of choosing may take the dish below nothing. */
export function checkOptions(item: Pick<MenuItem, "kind" | "pricePence">, groups: OptionGroup[]): OptionGroup[] {
  const bad = (message: string) => new DanError("bad_options", message);
  if (groups.length === 0) return [];
  if (item.kind === "set") throw bad("A set meal cannot have options.");
  if (groups.length > MAX_OPTION_GROUPS) throw bad("A dish has up to 8 groups of options.");
  const ids = new Set<string>();
  // The least a customer could pay for the dish, choosing to pay least.
  let least = item.pricePence;
  const tidy = groups.map((group) => {
    const id = group.id.trim();
    if (!ID.test(id) || ids.has(`group:${id}`)) throw bad("Each group of options needs its own id.");
    ids.add(`group:${id}`);
    const named = names(group.nameEn, group.nameZh, MAX_OPTION_NAME);
    if (!named) throw bad("Each group of options needs a name of up to 40 characters.");
    if (group.choices.length === 0 || group.choices.length > MAX_OPTION_CHOICES) throw bad("A group of options has 1 to 20 choices.");
    const kind = group.kind === "any" ? "any" : "one";
    const choices = group.choices.map((choice) => {
      const choiceId = choice.id.trim();
      if (!ID.test(choiceId) || ids.has(choiceId)) throw bad("Each choice needs its own id within the dish.");
      ids.add(choiceId);
      const choiceNamed = names(choice.nameEn, choice.nameZh, MAX_OPTION_NAME);
      if (!choiceNamed) throw bad("Each choice needs a name of up to 40 characters.");
      if (!Number.isInteger(choice.pricePence) || Math.abs(choice.pricePence) > 100_000) throw bad("Check the price of each choice.");
      const allergens = [...new Set(choice.allergens ?? [])];
      if (allergens.some((allergen) => !ALLERGENS.includes(allergen))) throw bad("Unknown allergen.");
      return { id: choiceId, nameEn: choiceNamed[0], nameZh: choiceNamed[1], pricePence: choice.pricePence, allergens };
    });
    const prices = choices.map((choice) => choice.pricePence);
    // One must be chosen: the cheapest of them. Any may be chosen: every one that takes money off.
    least += kind === "one" ? Math.min(...prices) : prices.filter((pence) => pence < 0).reduce((sum, pence) => sum + pence, 0);
    return { id, nameEn: named[0], nameZh: named[1], kind, choices } satisfies OptionGroup;
  });
  if (least < 0) throw bad("Those options could take the dish below nothing. Raise the price or change the choices.");
  return tidy;
}

/** A new id from a name: lowercase letters, digits and hyphens, and not one already used. */
export function newId(name: string, taken: string[], fallback: string): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24)
      .replace(/-+$/g, "") || fallback;
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 200; n += 1) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now().toString(36)}`;
}

/** An amount that may take off: "£1.20", "-£2.00". */
export function signedPence(pence: number): string {
  return pence < 0 ? `-${formatPence(-pence)}` : formatPence(pence);
}

/** A price change as a menu shows it: "+£1.50", "-£0.50", and nothing for no change. */
export function plusPence(pence: number): string {
  return pence === 0 ? "" : pence < 0 ? `-${formatPence(-pence)}` : `+${formatPence(pence)}`;
}

/** A percentage in hundredths, as people write it: 1000 is "10%", 1250 is "12.5%". */
export function percentText(value: number): string {
  return `${Number((Math.abs(value) / 100).toFixed(2))}%`;
}

/** An add-on's own amount, before it is applied: "+10%", "-£1.00", "+£0.10". */
export function amountLabel(addon: Pick<Addon | AppliedAddon, "kind" | "value">): string {
  const sign = addon.value < 0 ? "-" : "+";
  return addon.kind === "percent" ? `${sign}${percentText(addon.value)}` : `${sign}${formatPence(Math.abs(addon.value))}`;
}
