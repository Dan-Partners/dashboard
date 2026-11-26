"use client";

import { useState } from "react";
import { columnName, DEFAULT_BOARD } from "@/lib/board";
import { isDanError } from "@/lib/errors";
import { messageForError, useI18n } from "@/lib/i18n";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { checkViews, MAX_VIEWS, MAX_VIEW_NAME, newViewId, type View, type ViewLook } from "@/lib/views";
import { Button } from "./ui";

/** A row being edited. A new view has no id until it is saved. */
type Row = { id: string | null; nameEn: string; nameZh: string; look: ViewLook; columns: string[] };

const toRows = (views: View[]): Row[] =>
  views.map((view) => ({ id: view.id, nameEn: view.nameEn, nameZh: view.nameZh === view.nameEn ? "" : view.nameZh, look: view.look, columns: [...view.columns] }));

/**
 * The owner's views: screens for one part of the order flow (a kitchen, a
 * pass, a packing bench). Each has a name, a look, and the board columns it
 * shows. The counter PIN sees them read-only.
 */
export function ViewsSection() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const board = shop.snapshot?.board ?? DEFAULT_BOARD;
  const saved = shop.snapshot?.views ?? [];
  const [draft, setDraft] = useState<Row[] | null>(null);
  const rows = draft ?? toRows(saved);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  const edit = (change: (rows: Row[]) => Row[]) => {
    setMessage(null);
    setDraft(change(rows.map((row) => ({ ...row, columns: [...row.columns] }))));
  };
  const patch = (index: number, change: Partial<Row>) => edit((list) => list.map((row, at) => (at === index ? { ...row, ...change } : row)));
  const failed = (error: unknown) =>
    setMessage({ text: messageForError(isDanError(error) ? error.code : undefined, t, error instanceof Error ? error.message : undefined), failed: true });

  const save = () => {
    setMessage(null);
    let next: View[];
    try {
      // A new view gets its id from its name here, once, and keeps it.
      const taken = rows.map((row) => row.id).filter((id): id is string => id !== null);
      const named = rows.map((row) => {
        if (row.id) return { ...row, id: row.id };
        const id = newViewId(row.nameEn || row.nameZh, taken);
        taken.push(id);
        return { ...row, id };
      });
      // Columns the board no longer has are dropped as the list is saved.
      next = checkViews(
        named.map((row) => ({ ...row, columns: row.columns.filter((column) => board.columns.some((known) => known.id === column)) })),
        board,
      );
    } catch (error) {
      failed(error);
      return;
    }
    setBusy(true);
    void shop
      .saveViews(next)
      .then(() => {
        setDraft(null);
        setMessage({ text: t("shopDetailsSaved"), failed: false });
      })
      .catch(failed)
      .finally(() => setBusy(false));
  };

  const reset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      window.setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    setConfirmReset(false);
    setBusy(true);
    void shop
      .resetViews()
      .then(() => {
        setDraft(null);
        setMessage({ text: t("viewsResetDone"), failed: false });
      })
      .catch(failed)
      .finally(() => setBusy(false));
  };

  const field = "min-h-11 w-full border border-rule bg-paper-raised px-3 disabled:opacity-70";
  const label = "font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase";

  return (
    <section aria-labelledby="views-title" className="mt-10 max-w-3xl border-t border-rule pt-8" data-testid="views-section">
      <h2 id="views-title" className="font-display text-2xl">
        {t("viewsTitle")}
      </h2>
      <p className="mt-1 mb-4 text-ink-soft">{t("viewsLede")}</p>
      {!isOwner ? <p className="mb-4 text-sm text-ink-soft" data-testid="views-owner-only">{t("viewsOwnerOnly")}</p> : null}
      {rows.length === 0 ? (
        <p className="border-y border-rule py-6 text-ink-soft" data-testid="views-none">
          {t("viewsNone")}
        </p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {rows.map((row, index) => {
            const name = row.nameEn || row.nameZh || t("viewsNew");
            return (
              <li key={row.id ?? `new-${index}`} className="py-4" data-testid="view-row" data-view={row.id ?? ""}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    aria-label={`${t("menuCategoryName")}: ${name}`}
                    value={row.nameEn}
                    maxLength={MAX_VIEW_NAME}
                    disabled={!isOwner}
                    placeholder={t("menuCategoryName")}
                    className={field}
                    onChange={(event) => patch(index, { nameEn: event.target.value })}
                  />
                  <input
                    aria-label={`${t("menuCategoryNameZh")}: ${name}`}
                    value={row.nameZh}
                    maxLength={MAX_VIEW_NAME}
                    disabled={!isOwner}
                    placeholder={t("menuCategoryNameZh")}
                    className={`${field} font-zh`}
                    onChange={(event) => patch(index, { nameZh: event.target.value })}
                  />
                </div>
                <fieldset className="mt-3" disabled={!isOwner}>
                  <legend className={label}>{t("viewsLook")}</legend>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    {(["make", "hand_over"] as const).map((look) => (
                      <label key={look} className={`flex min-h-11 cursor-pointer flex-col justify-center border px-3 py-2 ${row.look === look ? "border-ink bg-paper-deep" : "border-rule"}`}>
                        <span className="flex items-center gap-2 font-display">
                          <input type="radio" name={`look-${row.id ?? `new-${index}`}`} checked={row.look === look} onChange={() => patch(index, { look })} aria-label={`${t(look === "make" ? "viewsLookMake" : "viewsLookHandOver")}: ${name}`} />
                          {t(look === "make" ? "viewsLookMake" : "viewsLookHandOver")}
                        </span>
                        <span className="text-sm text-ink-soft">{t(look === "make" ? "viewsLookMakeHint" : "viewsLookHandOverHint")}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="mt-3 flex flex-wrap gap-x-4 gap-y-1" disabled={!isOwner}>
                  <legend className={label}>{t("viewsColumns")}</legend>
                  {board.columns.map((column) => (
                    <label key={column.id} className="flex min-h-11 items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="size-5"
                        checked={row.columns.includes(column.id)}
                        aria-label={`${columnName(column, locale)}: ${name}`}
                        onChange={(event) => patch(index, { columns: event.target.checked ? [...row.columns, column.id] : row.columns.filter((id) => id !== column.id) })}
                      />
                      {columnName(column, locale)}
                    </label>
                  ))}
                </fieldset>
                {isOwner ? (
                  <button
                    type="button"
                    className="mt-2 min-h-11 cursor-pointer border border-rule px-3 font-display text-sm disabled:cursor-not-allowed disabled:opacity-40"
                    disabled={busy}
                    aria-label={`${t("menuCategoryRemove")}: ${name}`}
                    onClick={() => edit((list) => list.filter((_, at) => at !== index))}
                  >
                    {t("menuCategoryRemove")}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {isOwner ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="line"
              disabled={busy || rows.length >= MAX_VIEWS}
              onClick={() => edit((list) => [...list, { id: null, nameEn: "", nameZh: "", look: "make", columns: [] }])}
            >
              {t("viewsAdd")}
            </Button>
            <Button type="button" variant="accent" disabled={busy || draft === null} onClick={save}>
              {t("viewsSave")}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={reset} data-testid="views-reset">
              {t(confirmReset ? "viewsResetConfirm" : "viewsReset")}
            </Button>
            {draft !== null && !message ? <span className="text-sm text-ink-soft">{t("stationsUnsaved")}</span> : null}
            {message ? (
              <p className={`text-sm ${message.failed ? "text-accent-ink" : "text-ink-soft"}`} role={message.failed ? "alert" : "status"} data-testid="views-status">
                {message.text}
              </p>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-ink-soft">{t("viewsRemoveNote")}</p>
        </>
      ) : null}
    </section>
  );
}
