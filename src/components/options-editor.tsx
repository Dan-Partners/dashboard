"use client";

import { MAX_OPTION_CHOICES, MAX_OPTION_GROUPS, MAX_OPTION_NAME, newId } from "@/lib/addons";
import { parsePoundsToPence } from "@/lib/format";
import { useI18n, type CopyKey } from "@/lib/i18n";
import { ALLERGENS, type Allergen, type OptionGroup, type OptionKind } from "@/lib/types";
import { Button } from "./ui";

/** A choice being edited. A new one has no id until the dish is saved; its price change is typed as people write it. */
export type ChoiceRow = { id: string | null; nameEn: string; nameZh: string; price: string; allergens: Allergen[] };
export type GroupRow = { id: string | null; nameEn: string; nameZh: string; kind: OptionKind; choices: ChoiceRow[] };

const priceText = (pence: number) => (pence === 0 ? "" : `${pence < 0 ? "-" : ""}${(Math.abs(pence) / 100).toFixed(2)}`);

export const toOptionRows = (groups: OptionGroup[]): GroupRow[] =>
  groups.map((group) => ({
    id: group.id,
    nameEn: group.nameEn,
    nameZh: group.nameZh === group.nameEn ? "" : group.nameZh,
    kind: group.kind,
    choices: group.choices.map((choice) => ({
      id: choice.id,
      nameEn: choice.nameEn,
      nameZh: choice.nameZh === choice.nameEn ? "" : choice.nameZh,
      price: priceText(choice.pricePence),
      allergens: choice.allergens,
    })),
  }));

/** A price change as typed: nothing for no change, "1.50" or "+1.50" to add, "-0.50" to take off. Null when it cannot be read. */
export function parsePriceChange(typed: string): number | null {
  const text = typed.trim();
  if (!text) return 0;
  const minus = text.startsWith("-");
  const size = parsePoundsToPence(text.replace(/^[+-]/, ""));
  return size === null ? null : minus ? -size : size;
}

/**
 * The rows as the server takes them. A new group or choice gets its id from
 * its name here, once, and keeps it: orders name choices by it. Null when a
 * price change cannot be read.
 */
export function fromOptionRows(rows: GroupRow[]): OptionGroup[] | null {
  const groupIds = rows.map((row) => row.id).filter((id): id is string => id !== null);
  const choiceIds = rows.flatMap((row) => row.choices.map((choice) => choice.id)).filter((id): id is string => id !== null);
  const groups: OptionGroup[] = [];
  for (const row of rows) {
    let id = row.id;
    if (!id) {
      id = newId(row.nameEn || row.nameZh, groupIds, "group");
      groupIds.push(id);
    }
    const choices = [];
    for (const choice of row.choices) {
      const pricePence = parsePriceChange(choice.price);
      if (pricePence === null) return null;
      let choiceId = choice.id;
      if (!choiceId) {
        choiceId = newId(choice.nameEn || choice.nameZh, choiceIds, "choice");
        choiceIds.push(choiceId);
      }
      choices.push({ id: choiceId, nameEn: choice.nameEn, nameZh: choice.nameZh, pricePence, allergens: choice.allergens });
    }
    groups.push({ id, nameEn: row.nameEn, nameZh: row.nameZh, kind: row.kind, choices });
  }
  return groups;
}

/**
 * A dish's options, inside the dish form: groups of choices ("Size",
 * "Extras"), each "choose one" or "choose any". A choice can change the
 * price and can bring allergens of its own.
 */
export function OptionsEditor({ rows, onChange, allergenKey }: { rows: GroupRow[]; onChange: (rows: GroupRow[]) => void; allergenKey: Record<Allergen, CopyKey> }) {
  const { t } = useI18n();
  const setGroup = (at: number, change: Partial<GroupRow>) => onChange(rows.map((row, index) => (index === at ? { ...row, ...change } : row)));
  const setChoice = (at: number, choiceAt: number, change: Partial<ChoiceRow>) =>
    setGroup(at, { choices: rows[at].choices.map((choice, index) => (index === choiceAt ? { ...choice, ...change } : choice)) });
  const field = "mt-1 min-h-11 w-full border border-rule bg-paper-raised px-3";
  const label = "block font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase";
  const small = "min-h-11 cursor-pointer border border-rule px-3 font-display text-sm disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <fieldset data-testid="options-editor">
      <legend className={label}>{t("optionsTitle")}</legend>
      <p className="mt-1 text-sm text-ink-soft">{t("optionsLede")}</p>
      {rows.map((group, at) => (
        <div key={group.id ?? `new-${at}`} className="mt-3 border border-rule p-3" data-testid="option-group">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className={label}>{t("optionsGroupName")}</span>
              <input value={group.nameEn} maxLength={MAX_OPTION_NAME} name="option-group-name" className={field} onChange={(event) => setGroup(at, { nameEn: event.target.value })} />
            </label>
            <label>
              <span className={label}>{t("optionsGroupNameZh")}</span>
              <input value={group.nameZh} maxLength={MAX_OPTION_NAME} name="option-group-name-zh" className={`${field} font-zh`} onChange={(event) => setGroup(at, { nameZh: event.target.value })} />
            </label>
            <label className="sm:col-span-2">
              <span className="sr-only">{t("optionsTitle")}</span>
              <select value={group.kind} name="option-group-kind" className={field} onChange={(event) => setGroup(at, { kind: event.target.value === "any" ? "any" : "one" })}>
                <option value="one">{t("chooseOne")}</option>
                <option value="any">{t("chooseAny")}</option>
              </select>
              {group.kind === "one" ? <span className="mt-1 block text-sm text-ink-soft">{t("optionsFirstDefault")}</span> : null}
            </label>
          </div>
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {group.choices.map((choice, choiceAt) => (
              <li key={choice.id ?? `new-${choiceAt}`} className="py-3" data-testid="option-choice">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]">
                  <label>
                    <span className={label}>{t("optionsChoiceName")}</span>
                    <input value={choice.nameEn} maxLength={MAX_OPTION_NAME} name="option-choice-name" className={field} onChange={(event) => setChoice(at, choiceAt, { nameEn: event.target.value })} />
                  </label>
                  <label>
                    <span className={label}>{t("optionsChoiceNameZh")}</span>
                    <input value={choice.nameZh} maxLength={MAX_OPTION_NAME} name="option-choice-name-zh" className={`${field} font-zh`} onChange={(event) => setChoice(at, choiceAt, { nameZh: event.target.value })} />
                  </label>
                  <label>
                    <span className={label}>{t("optionsChoicePrice")}</span>
                    <input value={choice.price} inputMode="decimal" placeholder="0.00" name="option-choice-price" className={field} onChange={(event) => setChoice(at, choiceAt, { price: event.target.value })} />
                  </label>
                </div>
                <details className="mt-2">
                  <summary className="min-h-11 cursor-pointer py-2 text-sm text-ink-soft">
                    {t("optionsChoiceAllergens")}
                    {choice.allergens.length > 0 ? `: ${choice.allergens.map((allergen) => t(allergenKey[allergen])).join(", ")}` : ""}
                  </summary>
                  <div className="grid grid-cols-2 gap-x-2">
                    {ALLERGENS.map((allergen) => (
                      <label key={allergen} className="flex min-h-11 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={choice.allergens.includes(allergen)}
                          onChange={() => setChoice(at, choiceAt, { allergens: choice.allergens.includes(allergen) ? choice.allergens.filter((entry) => entry !== allergen) : [...choice.allergens, allergen] })}
                        />
                        {t(allergenKey[allergen])}
                      </label>
                    ))}
                  </div>
                </details>
                <button
                  type="button"
                  className={small}
                  aria-label={`${t("optionsRemoveChoice")}: ${choice.nameEn || choice.nameZh}`}
                  onClick={() => setGroup(at, { choices: group.choices.filter((_, index) => index !== choiceAt) })}
                >
                  {t("optionsRemoveChoice")}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={small}
              disabled={group.choices.length >= MAX_OPTION_CHOICES}
              onClick={() => setGroup(at, { choices: [...group.choices, { id: null, nameEn: "", nameZh: "", price: "", allergens: [] }] })}
              data-testid="option-add-choice"
            >
              {t("optionsAddChoice")}
            </button>
            <button type="button" className={small} onClick={() => onChange(rows.filter((_, index) => index !== at))} data-testid="option-remove-group">
              {t("optionsRemoveGroup")}
            </button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="line"
        className="mt-3"
        disabled={rows.length >= MAX_OPTION_GROUPS}
        onClick={() => onChange([...rows, { id: null, nameEn: "", nameZh: "", kind: "one", choices: [{ id: null, nameEn: "", nameZh: "", price: "", allergens: [] }] }])}
        data-testid="option-add-group"
      >
        {t("optionsAddGroup")}
      </Button>
    </fieldset>
  );
}
