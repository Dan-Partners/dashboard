"use client";

import { useMemo, useState } from "react";
import { amountLabel, plusPence } from "@/lib/addons";
import { formatPence, primaryName, secondaryName } from "@/lib/format";
import { useI18n, type CopyKey } from "@/lib/i18n";
import { asApplied, lineFromMenu, lineTotal, optionsFor, withAddons } from "@/lib/pricing";
import type { Addon, Allergen, MenuItem } from "@/lib/types";
import { Button, Dialog } from "./ui";

/** What was chosen for a dish: the ids of its option choices and of the add-ons on it, and how many. */
export type DishChoice = { options: string[]; addons: string[]; qty: number };

const ALLERGEN_KEY: Record<Allergen, CopyKey> = {
  celery: "allergenCelery",
  gluten: "allergenGluten",
  crustaceans: "allergenCrustaceans",
  eggs: "allergenEggs",
  fish: "allergenFish",
  lupin: "allergenLupin",
  milk: "allergenMilk",
  molluscs: "allergenMolluscs",
  mustard: "allergenMustard",
  nuts: "allergenNuts",
  peanuts: "allergenPeanuts",
  sesame: "allergenSesame",
  soya: "allergenSoya",
  sulphites: "allergenSulphites",
};

/** The choices a dish starts with: the first of each "choose one" group, and the add-ons ticked by default or required. */
export function defaultChoice(item: MenuItem, dishAddons: Addon[]): Omit<DishChoice, "qty"> {
  return {
    options: optionsFor(item, []).map((option) => option.choiceId),
    addons: dishAddons.filter((addon) => addon.auto || addon.required).map((addon) => addon.id),
  };
}

/**
 * Choosing how a dish is taken: one of each "choose one" group, any of each
 * "choose any" group, and the add-ons offered on a dish. `lockRequired`:
 * whoever creates an order cannot take a required add-on off (the owner,
 * changing an order afterwards, can).
 */
export function DishChooser({
  item,
  menu,
  dishAddons,
  lockRequired,
  start,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  item: MenuItem;
  menu: MenuItem[];
  /** The add-ons that may go on a dish here, in the owner's order. */
  dishAddons: Addon[];
  lockRequired: boolean;
  /** What is chosen to begin with. Left out: the defaults. */
  start?: DishChoice;
  confirmLabel: string;
  onConfirm: (choice: DishChoice) => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const initial = useMemo(() => start ?? { ...defaultChoice(item, dishAddons), qty: 1 }, [start, item, dishAddons]);
  const [options, setOptions] = useState<string[]>(initial.options);
  const [addons, setAddons] = useState<string[]>(initial.addons);
  const [qty, setQty] = useState(initial.qty);
  const groups = item.options ?? [];

  // What it comes to, by the same rule the server uses.
  const total = useMemo(() => {
    try {
      const line = lineFromMenu(item.number, qty, options, menu);
      return lineTotal(withAddons(line, dishAddons.filter((addon) => addons.includes(addon.id)).map(asApplied)));
    } catch {
      return null;
    }
  }, [item.number, qty, options, addons, dishAddons, menu]);

  const pick = (groupId: string, choiceId: string, one: boolean) => {
    const group = groups.find((entry) => entry.id === groupId);
    if (!group) return;
    const others = options.filter((id) => !group.choices.some((choice) => choice.id === id));
    if (one) return setOptions([...others, choiceId]);
    setOptions(options.includes(choiceId) ? options.filter((id) => id !== choiceId) : [...options, choiceId]);
  };
  const row = "flex min-h-11 cursor-pointer items-center gap-3 py-1";

  return (
    <Dialog open title={`${item.number} ${primaryName(item.nameEn, item.nameZh, locale)}`} onClose={onClose}>
      <form
        className="space-y-5"
        data-testid="dish-chooser"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm({ options, addons, qty });
        }}
      >
        {secondaryName(item.nameEn, item.nameZh, locale) ? <p className="-mt-2 font-zh text-ink-soft">{secondaryName(item.nameEn, item.nameZh, locale)}</p> : null}
        {groups.map((group) => (
          <fieldset key={group.id} data-testid="chooser-group" data-group={group.id}>
            <legend className="font-display text-lg">
              {primaryName(group.nameEn, group.nameZh, locale)}
              <span className="ml-2 font-zh text-sm text-ink-soft">{secondaryName(group.nameEn, group.nameZh, locale)}</span>
              <span className="ml-2 font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase">{t(group.kind === "one" ? "chooseOne" : "chooseAny")}</span>
            </legend>
            <div className="mt-1 divide-y divide-rule border-y border-rule">
              {group.choices.map((choice) => (
                <label key={choice.id} className={row}>
                  <input
                    type={group.kind === "one" ? "radio" : "checkbox"}
                    name={`${item.id}-${group.id}`}
                    checked={options.includes(choice.id)}
                    onChange={() => pick(group.id, choice.id, group.kind === "one")}
                    data-testid="chooser-choice"
                    data-choice={choice.id}
                  />
                  <span className="min-w-0 flex-1">
                    {primaryName(choice.nameEn, choice.nameZh, locale)}
                    <span className="ml-2 font-zh text-sm text-ink-soft">{secondaryName(choice.nameEn, choice.nameZh, locale)}</span>
                    {choice.allergens.length > 0 ? (
                      <span className="block text-xs tracking-wide text-ink-soft uppercase">{choice.allergens.map((allergen) => t(ALLERGEN_KEY[allergen])).join(" · ")}</span>
                    ) : null}
                  </span>
                  <span className="font-display">{plusPence(choice.pricePence)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        {dishAddons.length > 0 ? (
          <fieldset data-testid="chooser-addons">
            <legend className="font-display text-lg">{t("chooseAddons")}</legend>
            <div className="mt-1 divide-y divide-rule border-y border-rule">
              {dishAddons.map((addon) => {
                const locked = lockRequired && addon.required;
                return (
                  <label key={addon.id} className={`${row} ${locked ? "cursor-default" : ""}`}>
                    <input
                      type="checkbox"
                      checked={locked || addons.includes(addon.id)}
                      disabled={locked}
                      onChange={() => setAddons(addons.includes(addon.id) ? addons.filter((id) => id !== addon.id) : [...addons, addon.id])}
                      data-testid="chooser-addon"
                      data-addon={addon.id}
                    />
                    <span className="min-w-0 flex-1">
                      {primaryName(addon.nameEn, addon.nameZh, locale)}
                      <span className="ml-2 font-zh text-sm text-ink-soft">{secondaryName(addon.nameEn, addon.nameZh, locale)}</span>
                      {locked ? <span className="block text-sm text-ink-soft">{t("chooseRequired")}</span> : null}
                    </span>
                    <span className="font-display">{amountLabel(addon)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <span className="font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase">{t("chooseQty")}</span>
          <span className="flex items-center gap-1">
            <button type="button" aria-label="−" className="min-h-11 min-w-11 cursor-pointer border border-rule font-display text-lg active:bg-paper-deep" onClick={() => setQty(Math.max(1, qty - 1))}>
              −
            </button>
            <span className="w-8 text-center font-display text-xl" data-testid="chooser-qty">
              {qty}
            </span>
            <button type="button" aria-label="+" className="min-h-11 min-w-11 cursor-pointer border border-rule font-display text-lg active:bg-paper-deep" onClick={() => setQty(Math.min(99, qty + 1))}>
              +
            </button>
          </span>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="accent" className="flex-1" disabled={total === null} data-testid="chooser-confirm">
            {confirmLabel}
            {total !== null ? <span className="ml-1 whitespace-nowrap">· {formatPence(total)}</span> : null}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
