"use client";

import { useState } from "react";
import { amountLabel, checkAddons, MAX_ADDON_NAME, MAX_ADDONS, newId } from "@/lib/addons";
import { isDanError } from "@/lib/errors";
import { parsePoundsToPence } from "@/lib/format";
import { messageForError, useI18n } from "@/lib/i18n";
import { useIsOwner, useShop } from "@/lib/shop-context";
import type { Addon } from "@/lib/types";
import { Button } from "./ui";

/** A row being edited. A new add-on has no id until it is saved; its amount is typed as people write it. */
type Row = { id: string | null; nameEn: string; nameZh: string; scope: Addon["scope"]; kind: Addon["kind"]; minus: boolean; amount: string; auto: boolean; required: boolean; channels: Addon["channels"] };

const toRows = (addons: Addon[]): Row[] =>
  addons.map((addon) => ({
    id: addon.id,
    nameEn: addon.nameEn,
    nameZh: addon.nameZh === addon.nameEn ? "" : addon.nameZh,
    scope: addon.scope,
    kind: addon.kind,
    minus: addon.value < 0,
    // Pounds for a fixed amount, a plain percentage otherwise: 12.5 for 12.5%.
    amount: addon.kind === "fixed" ? (Math.abs(addon.value) / 100).toFixed(2) : String(Number((Math.abs(addon.value) / 100).toFixed(2))),
    auto: addon.auto,
    required: addon.required,
    channels: addon.channels,
  }));

/** What a row's amount is in the server's units: pence, or hundredths of a percent. Null when it cannot be read. */
function valueOf(row: Row): number | null {
  const typed = row.amount.trim().replace(/%$/, "");
  const size = row.kind === "fixed" ? parsePoundsToPence(typed) : /^\d{1,3}(\.\d{1,2})?$/.test(typed) ? Math.round(Number(typed) * 100) : null;
  if (size === null || size <= 0) return null;
  return row.minus ? -size : size;
}

/**
 * The owner's add-ons: named amounts for the whole bill or for one dish,
 * plus or minus, fixed or a percentage. For each: whether it is ticked by
 * default, whether it is required, and where it is used. The counter PIN
 * sees the list, read-only.
 */
export function AddonsSection() {
  const { t } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const saved = shop.snapshot?.addons ?? [];
  const [draft, setDraft] = useState<Row[] | null>(null);
  const rows = draft ?? toRows(saved);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const edit = (change: (rows: Row[]) => Row[]) => {
    setMessage(null);
    setDraft(change(rows.map((row) => ({ ...row }))));
  };
  const set = (index: number, change: Partial<Row>) => edit((list) => list.map((entry, at) => (at === index ? { ...entry, ...change } : entry)));
  const failed = (error: unknown) =>
    setMessage({ text: messageForError(isDanError(error) ? error.code : undefined, t, error instanceof Error ? error.message : undefined), failed: true });

  const save = () => {
    setMessage(null);
    let next: Addon[];
    try {
      // A new add-on gets its id from its name here, once, and keeps it: orders name add-ons by it.
      const taken = rows.map((row) => row.id).filter((id): id is string => id !== null);
      next = checkAddons(
        rows.map((row) => {
          const value = valueOf(row);
          if (value === null) throw new Error("amount");
          let id = row.id;
          if (!id) {
            id = newId(row.nameEn || row.nameZh, taken, "addon");
            taken.push(id);
          }
          return { id, nameEn: row.nameEn, nameZh: row.nameZh, scope: row.scope, kind: row.kind, value, auto: row.auto, required: row.required, channels: row.channels };
        }),
      );
    } catch (error) {
      if (isDanError(error)) failed(error);
      else setMessage({ text: t("addonsInvalid"), failed: true });
      return;
    }
    setBusy(true);
    void shop
      .saveAddons(next)
      .then(() => {
        setDraft(null);
        setMessage({ text: t("shopDetailsSaved"), failed: false });
      })
      .catch(failed)
      .finally(() => setBusy(false));
  };

  const small = "min-h-11 min-w-11 cursor-pointer border border-rule px-2 font-display text-sm disabled:cursor-not-allowed disabled:opacity-40";
  const field = "mt-1 min-h-11 w-full border border-rule bg-paper-raised px-3 disabled:opacity-70";
  const label = "block font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase";

  return (
    <section aria-labelledby="addons-title" className="mt-10 max-w-3xl border-t border-rule pt-8" data-testid="addons-section">
      <h2 id="addons-title" className="font-display text-2xl">
        {t("addonsTitle")}
      </h2>
      <p className="mt-1 mb-4 text-ink-soft">{t("addonsLede")}</p>
      {!isOwner ? <p className="mb-4 text-sm text-ink-soft" data-testid="addons-owner-only">{t("addonsOwnerOnly")}</p> : null}
      {rows.length === 0 ? (
        <p className="border-y border-rule py-6 text-ink-soft" data-testid="addons-none">
          {t("addonsNone")}
        </p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {rows.map((row, index) => {
            const name = row.nameEn || row.nameZh || t("addonsNew");
            const value = valueOf(row);
            return (
              <li key={row.id ?? `new-${index}`} className="py-4" data-testid="addon-row" data-addon={row.id ?? ""}>
                <fieldset disabled={!isOwner} className="grid gap-3 sm:grid-cols-2">
                  <legend className="sr-only">{name}</legend>
                  <label>
                    <span className={label}>{t("menuCategoryName")}</span>
                    <input value={row.nameEn} maxLength={MAX_ADDON_NAME} className={field} name="addon-name" onChange={(event) => set(index, { nameEn: event.target.value })} />
                  </label>
                  <label>
                    <span className={label}>{t("menuCategoryNameZh")}</span>
                    <input value={row.nameZh} maxLength={MAX_ADDON_NAME} className={`${field} font-zh`} name="addon-name-zh" onChange={(event) => set(index, { nameZh: event.target.value })} />
                  </label>
                  <label>
                    <span className={label}>{t("addonsScope")}</span>
                    <select value={row.scope} className={field} name="addon-scope" onChange={(event) => set(index, { scope: event.target.value === "dish" ? "dish" : "bill" })}>
                      <option value="bill">{t("addonsScopeBill")}</option>
                      <option value="dish">{t("addonsScopeDish")}</option>
                    </select>
                  </label>
                  <label>
                    <span className={label}>{t("addonsDirection")}</span>
                    <select value={row.minus ? "minus" : "plus"} className={field} name="addon-direction" onChange={(event) => set(index, { minus: event.target.value === "minus" })}>
                      <option value="plus">{t("addonsPlus")}</option>
                      <option value="minus">{t("addonsMinus")}</option>
                    </select>
                  </label>
                  <label>
                    <span className={label}>{t("addonsKind")}</span>
                    <select value={row.kind} className={field} name="addon-kind" onChange={(event) => set(index, { kind: event.target.value === "percent" ? "percent" : "fixed" })}>
                      <option value="fixed">{t("addonsFixed")}</option>
                      <option value="percent">{t("addonsPercent")}</option>
                    </select>
                  </label>
                  <label>
                    <span className={label}>
                      {t("addonsAmount")} ({row.kind === "fixed" ? "£" : "%"})
                    </span>
                    <input value={row.amount} inputMode="decimal" placeholder={row.kind === "fixed" ? "0.00" : "10"} className={field} name="addon-amount" onChange={(event) => set(index, { amount: event.target.value })} />
                  </label>
                  <label>
                    <span className={label}>{t("addonsChannels")}</span>
                    <select
                      value={row.channels}
                      className={field}
                      name="addon-channels"
                      onChange={(event) => set(index, { channels: event.target.value === "online" ? "online" : event.target.value === "local" ? "local" : "both" })}
                    >
                      <option value="both">{t("addonsBoth")}</option>
                      <option value="online">{t("addonsOnline")}</option>
                      <option value="local">{t("addonsLocal")}</option>
                    </select>
                  </label>
                  <div className="sm:col-span-2">
                    {/* Required is always on, so it is ticked by default too: the first box follows the second. */}
                    <label className="flex min-h-11 items-center gap-2">
                      <input type="checkbox" name="addon-auto" checked={row.auto || row.required} disabled={row.required} onChange={(event) => set(index, { auto: event.target.checked })} />
                      {t("addonsAuto")}
                    </label>
                    <label className="flex min-h-11 items-center gap-2">
                      <input type="checkbox" name="addon-required" checked={row.required} onChange={(event) => set(index, { required: event.target.checked, auto: row.auto || event.target.checked })} />
                      {t("addonsRequired")}
                    </label>
                  </div>
                </fieldset>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {isOwner ? (
                    <>
                      <button
                        type="button"
                        className={small}
                        disabled={busy || index === 0}
                        aria-label={`${t("menuCategoryUp")}: ${name}`}
                        onClick={() =>
                          edit((list) => {
                            [list[index - 1], list[index]] = [list[index], list[index - 1]];
                            return list;
                          })
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={small}
                        disabled={busy || index === rows.length - 1}
                        aria-label={`${t("menuCategoryDown")}: ${name}`}
                        onClick={() =>
                          edit((list) => {
                            [list[index + 1], list[index]] = [list[index], list[index + 1]];
                            return list;
                          })
                        }
                      >
                        ↓
                      </button>
                      <button type="button" className={small} disabled={busy} aria-label={`${t("menuCategoryRemove")}: ${name}`} onClick={() => edit((list) => list.filter((_, at) => at !== index))}>
                        {t("menuCategoryRemove")}
                      </button>
                    </>
                  ) : null}
                  {/* The amount as an order will show it, so a slip of the keys is seen before it is saved. */}
                  <span className="font-display text-ink-soft" data-testid="addon-amount-shown">
                    {value === null ? "" : amountLabel({ kind: row.kind, value })}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-sm text-ink-soft">{t("addonsKept")}</p>
      {isOwner ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="line"
            disabled={busy || rows.length >= MAX_ADDONS}
            onClick={() => edit((list) => [...list, { id: null, nameEn: "", nameZh: "", scope: "bill", kind: "fixed", minus: false, amount: "", auto: false, required: false, channels: "both" }])}
            data-testid="addons-add"
          >
            {t("addonsAdd")}
          </Button>
          <Button type="button" variant="accent" disabled={busy || draft === null} onClick={save} data-testid="addons-save">
            {t("addonsSave")}
          </Button>
          {draft !== null && !message ? <span className="text-sm text-ink-soft">{t("stationsUnsaved")}</span> : null}
          {message ? (
            <p className={`text-sm ${message.failed ? "text-accent-ink" : "text-ink-soft"}`} role={message.failed ? "alert" : "status"} data-testid="addons-status">
              {message.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
