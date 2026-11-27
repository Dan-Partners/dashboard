"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { columnName, columnOf, DEFAULT_BOARD } from "@/lib/board";
import { dishesFor } from "@/lib/create-order";
import { isDanError } from "@/lib/errors";
import { formatPence, orderLabel, primaryName, secondaryName } from "@/lib/format";
import { listTime } from "@/lib/history";
import { messageForError, useI18n, type CopyKey } from "@/lib/i18n";
import { applyEdit, courierBooked, paidDifference, type OrderEdit, type OrderEditInput } from "@/lib/order-edit";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { useTapGuard } from "@/lib/tap-guard";
import { useBoardColour } from "@/lib/use-board-colour";
import type { MenuItem, Order } from "@/lib/types";
import { Docket } from "./orders-board";
import { PaidDifference } from "./paid-difference";
import { Button, PageTitle } from "./ui";

type DraftLine = { number: number; qty: number; nameEn: string; nameZh: string; unitPricePence: number };
type Draft = { customerName: string; phone: string; address: string; table: string; notes: string; lines: DraftLine[] };

const draftOf = (order: Order): Draft => ({
  customerName: order.customerName,
  phone: order.phone,
  address: order.address,
  table: order.table ?? "",
  notes: order.notes,
  lines: order.lines.map((line) => ({ number: line.number, qty: line.qty, nameEn: line.nameEn, nameZh: line.nameZh, unitPricePence: line.unitPricePence })),
});

/** What the owner's draft asks for: only what an order of that kind has. */
function inputOf(order: Order, draft: Draft): OrderEditInput {
  return {
    customerName: draft.customerName,
    phone: draft.phone,
    notes: draft.notes,
    address: draft.address,
    ...(order.fulfilment === "eat_in" ? { table: draft.table } : {}),
    lines: draft.lines.map((line) => ({ number: line.number, qty: line.qty })),
  };
}

const FIELD_LABEL: Record<string, CopyKey> = { customerName: "editName", phone: "editPhone", address: "editAddress", notes: "editNote", table: "table", column: "moveColumn" };

/**
 * One order on its own page. Anyone signed in sees it. The owner can change
 * its details and dishes and move the ticket to any column; every change is
 * recorded, and the record is shown here.
 */
export function OrderScreen({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const board = shop.snapshot?.board ?? DEFAULT_BOARD;
  const shown = useBoardColour();
  const guard = useTapGuard();
  const live = shop.snapshot?.orders.find((entry) => entry.id === id);
  // An order older than the board's: asked for by itself.
  const [fetched, setFetched] = useState<{ id: string; order: Order | null; error: string | null } | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [recordKey, setRecordKey] = useState(0);
  // Which saved state of the order the owner has just made: its editor says so.
  const [savedCount, setSavedCount] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const fail = (error: unknown) => messageForError(isDanError(error) ? error.code : undefined, t, error instanceof Error ? error.message : undefined);
  const load = useEffectEvent(() => shop.loadOrder(id));
  const known = Boolean(live);
  const ready = Boolean(shop.snapshot);
  useEffect(() => {
    if (known || !ready) return;
    let stale = false;
    load().then(
      (order) => !stale && setFetched({ id, order, error: null }),
      (error: unknown) => !stale && setFetched({ id, order: null, error: isDanError(error) && error.code === "not_found" ? "" : fail(error) }),
    );
    return () => {
      stale = true;
    };
    // `fail` only words the error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, known, ready]);

  const mine = fetched?.id === id ? fetched : null;
  const order = live ?? mine?.order ?? null;
  const back = (
    <p className="mb-5">
      <Link href="/shop/orders" className="inline-flex min-h-11 items-center font-display text-ink-soft underline">
        ← {t("createBack")}
      </Link>
    </p>
  );

  if (!order) {
    return (
      <div>
        <PageTitle className="mb-4" title={t("orderTitle")} />
        {back}
        {mine ? (
          <p className="border-l-2 border-accent pl-3" role="alert" data-testid="order-missing">
            {mine.error || t("orderMissing")}
          </p>
        ) : (
          <p className="text-ink-soft">{t("orderLoading")}</p>
        )}
      </div>
    );
  }

  const column = order.status === "cancelled" ? null : columnOf(board, order);
  const changed = (next: Order) => {
    // An order the board does not have is kept here; the board's own follow by themselves.
    if (!live) setFetched({ id, order: next, error: null });
    setRecordKey((key) => key + 1);
  };
  const saved = (next: Order) => {
    setSavedCount(next.editCount ?? 0);
    changed(next);
  };

  return (
    <div data-testid="order-screen" data-order={order.id}>
      <PageTitle className="mb-4" title={`${t("orderTitle")} ${orderLabel(order.number, t("numberWaiting"))}`} gloss={locale === "zh-Hant" ? "Order" : "訂單"} />
      {back}
      {cardError ? (
        <p className="mb-4 border-l-2 border-accent pl-3 text-sm" role="alert">
          {cardError}
        </p>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div>
          <Docket
            order={order}
            board={board}
            colour={column ? shown(column.colour) : "var(--color-rule)"}
            now={now}
            rewardReady={false}
            locked={false}
            guard={guard}
            onError={setCardError}
            ticketLink={Boolean(live)}
            editLink={false}
          />
        </div>
        <div className="min-w-0 space-y-10">
          {!isOwner ? (
            <p className="border-l-2 border-accent pl-3" data-testid="order-owner-only">
              {t("orderOwnerOnly")}
            </p>
          ) : order.status === "cancelled" ? (
            <p className="border-l-2 border-accent pl-3" data-testid="order-cancelled-note">
              {t("orderCancelledNote")}
            </p>
          ) : (
            <>
              {/* A new editor for each saved state of the order, so the form always starts from what is saved. */}
              <OrderEditor key={`${order.id}:${order.editCount ?? 0}`} order={order} justSaved={savedCount === (order.editCount ?? 0)} onSaved={saved} />
              <MoveTicket order={order} onMoved={changed} />
            </>
          )}
          {isOwner ? <Record orderId={order.id} recordKey={`${recordKey}:${order.editCount ?? 0}:${order.column ?? ""}:${order.status}`} now={now} /> : null}
        </div>
      </div>
    </div>
  );
}

/** The owner's form: details and dishes, saved as one change. */
function OrderEditor({ order, justSaved, onSaved }: { order: Order; justSaved: boolean; onSaved: (order: Order) => void }) {
  const { t, locale } = useI18n();
  const shop = useShop();
  const items = useMemo(() => shop.snapshot?.items ?? [], [shop.snapshot?.items]);
  const categories = useMemo(() => shop.snapshot?.categories ?? [], [shop.snapshot?.categories]);
  const [draft, setDraft] = useState<Draft>(() => draftOf(order));
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  // "Saved" stays until the owner starts another change.
  const [touched, setTouched] = useState(false);
  const message = problem ?? (justSaved && !touched ? { text: t("editSaved"), failed: false } : null);
  const locked = courierBooked(order);

  const edit = (change: Partial<Draft>) => {
    setMessage(null);
    setTouched(true);
    setDraft((current) => ({ ...current, ...change }));
  };
  const setQty = (number: number, delta: number) =>
    edit({ lines: draft.lines.flatMap((line) => (line.number !== number ? [line] : line.qty + delta <= 0 ? [] : [{ ...line, qty: Math.min(99, line.qty + delta) }])) });
  const addDish = (item: MenuItem) => {
    setSearch("");
    const there = draft.lines.find((line) => line.number === item.number);
    if (there) return setQty(item.number, 1);
    // A dish that was on the order comes back at the price it was sold at.
    const sold = order.lines.find((line) => line.number === item.number);
    edit({ lines: [...draft.lines, { number: item.number, qty: 1, nameEn: sold?.nameEn ?? item.nameEn, nameZh: sold?.nameZh ?? item.nameZh, unitPricePence: sold?.unitPricePence ?? item.pricePence }] });
  };

  // What saving would do, worked out by the server's own rules; or why it would be refused.
  const preview = useMemo(() => {
    try {
      return { applied: applyEdit(order, inputOf(order, draft), items, locked), problem: null };
    } catch (error) {
      const text =
        draft.lines.length === 0
          ? t("editNeedsDish")
          : order.fulfilment === "delivery" && !draft.address.trim()
            ? t("editNeedsAddress")
            : messageForError(isDanError(error) ? error.code : undefined, t, error instanceof Error ? error.message : undefined);
      return { applied: null, problem: text };
    }
  }, [order, draft, items, locked, t]);
  const dirty = Boolean(preview.problem) || Boolean(preview.applied && (preview.applied.changes.length > 0 || preview.applied.lines.length > 0));
  const total = preview.applied?.order.totalPence ?? order.totalPence;
  const difference = preview.applied ? paidDifference(preview.applied.order) : null;
  const matches = search.trim() ? dishesFor(items, categories, null, search).slice(0, 6) : [];

  const save = () => {
    if (preview.problem) return setMessage({ text: preview.problem, failed: true });
    setBusy(true);
    setMessage(null);
    shop
      .editOrder(order.id, inputOf(order, draft))
      // The editor starts again from the saved order, and says it was saved.
      .then(onSaved)
      .catch((error: unknown) => setMessage({ text: messageForError(isDanError(error) ? error.code : undefined, t, error instanceof Error ? error.message : undefined), failed: true }))
      .finally(() => setBusy(false));
  };

  const field = "mt-1 min-h-11 w-full border border-rule bg-paper-raised px-3 disabled:opacity-60";
  const label = "block font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase";

  return (
    <section aria-labelledby="edit-title" data-testid="order-editor">
      <h2 id="edit-title" className="font-display text-2xl">
        {t("editTitle")}
      </h2>
      <p className="mt-1 mb-4 text-sm text-ink-soft">{t("editLede")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className={label}>{t("editName")}</span>
          <input value={draft.customerName} maxLength={120} onChange={(event) => edit({ customerName: event.target.value })} className={field} name="edit-name" />
        </label>
        <label>
          <span className={label}>{t("editPhone")}</span>
          <input value={draft.phone} maxLength={40} inputMode="tel" onChange={(event) => edit({ phone: event.target.value })} className={field} name="edit-phone" />
        </label>
        {order.fulfilment === "delivery" || order.address ? (
          <label className="sm:col-span-2">
            <span className={label}>{t("editAddress")}</span>
            <input value={draft.address} maxLength={400} disabled={locked} onChange={(event) => edit({ address: event.target.value })} className={field} name="edit-address" />
            {locked ? (
              <span className="mt-1 block text-sm text-ink-soft" data-testid="address-locked">
                {t("editAddressLocked")}
              </span>
            ) : null}
          </label>
        ) : null}
        {order.fulfilment === "eat_in" ? (
          <label>
            <span className={label}>{t("table")}</span>
            <input value={draft.table} maxLength={10} onChange={(event) => edit({ table: event.target.value })} className={field} name="edit-table" />
          </label>
        ) : null}
        <label className="sm:col-span-2">
          <span className={label}>{t("editNote")}</span>
          <input value={draft.notes} maxLength={400} onChange={(event) => edit({ notes: event.target.value })} className={field} name="edit-notes" />
        </label>
      </div>

      <h3 className="mt-6 font-display text-lg">{t("editDishes")}</h3>
      <ul className="mt-2 divide-y divide-rule border-y border-rule">
        {draft.lines.length === 0 ? <li className="py-4 text-ink-soft">{t("tillEmpty")}</li> : null}
        {draft.lines.map((line) => (
          <li key={line.number} className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 py-2" data-testid="edit-line" data-number={line.number}>
            <span className="w-10 font-display text-xl text-accent-ink">{line.number}</span>
            <span className="min-w-[7rem] flex-1">
              <span className="block leading-tight">{primaryName(line.nameEn, line.nameZh, locale)}</span>
              <span className="font-zh text-sm text-ink-soft">{secondaryName(line.nameEn, line.nameZh, locale)}</span>
            </span>
            <span className="flex items-center gap-1">
              <QtyButton label="−" name={`${t("editDishes")} ${line.number} −`} onClick={() => setQty(line.number, -1)} />
              <span className="w-6 text-center font-display" data-testid="edit-qty">
                {line.qty}
              </span>
              <QtyButton label="+" name={`${t("editDishes")} ${line.number} +`} onClick={() => setQty(line.number, 1)} />
            </span>
            <span className="w-16 text-right font-display">{formatPence(line.qty * line.unitPricePence)}</span>
            <button type="button" className="min-h-11 min-w-11 cursor-pointer px-1 text-sm text-ink-soft active:text-ink" onClick={() => edit({ lines: draft.lines.filter((entry) => entry.number !== line.number) })}>
              {t("tillRemove")}
            </button>
          </li>
        ))}
      </ul>
      <label className="mt-3 block">
        <span className={label}>{t("editAddDish")}</span>
        <input type="search" value={search} maxLength={40} onChange={(event) => setSearch(event.target.value)} className={field} data-testid="edit-add-search" />
      </label>
      {matches.length > 0 ? (
        <ul className="divide-y divide-rule border border-t-0 border-rule bg-paper-raised" data-testid="edit-add-list">
          {matches.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={item.soldOut && !order.lines.some((line) => line.number === item.number)}
                onClick={() => addDish(item)}
                className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 py-1 text-left active:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="edit-add-dish"
                data-number={item.number}
              >
                <span className="w-10 shrink-0 font-display text-lg text-accent-ink">{item.number}</span>
                <span className="min-w-0 flex-1">
                  {primaryName(item.nameEn, item.nameZh, locale)}
                  <span className="ml-2 font-zh text-sm text-ink-soft">{secondaryName(item.nameEn, item.nameZh, locale)}</span>
                </span>
                <span className="shrink-0 font-display">{item.soldOut ? t("menuSoldOut") : formatPence(item.pricePence)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 flex items-baseline justify-between border-t-[3px] border-ink pt-3">
        <span className="font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("editBill")}</span>
        <span className="font-display text-3xl" data-testid="edit-total">
          {total !== order.totalPence ? <span className="mr-3 text-xl text-ink-soft line-through">{formatPence(order.totalPence)}</span> : null}
          {formatPence(total)}
        </span>
      </div>
      {difference && preview.applied ? <PaidDifference order={preview.applied.order} className="mt-2" /> : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="accent" disabled={busy || !dirty} onClick={save}>
          {t("editSave")}
        </Button>
        <Button
          variant="ghost"
          disabled={busy || !dirty}
          onClick={() => {
            setDraft(draftOf(order));
            setMessage(null);
          }}
        >
          {t("editUndo")}
        </Button>
        {message ? (
          <p className={`text-sm ${message.failed ? "text-accent-ink" : "text-ink-soft"}`} role={message.failed ? "alert" : "status"} data-testid="edit-status">
            {message.text}
          </p>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-ink-soft">{t("editRecorded")}</p>
    </section>
  );
}

function QtyButton({ label, name, onClick }: { label: string; name: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={name} onClick={onClick} className="min-h-11 min-w-11 cursor-pointer border border-rule font-display text-lg active:bg-paper-deep">
      {label}
    </button>
  );
}

/** The owner's own move: to any column of the board, back included. */
function MoveTicket({ order, onMoved }: { order: Order; onMoved: (order: Order) => void }) {
  const { t, locale } = useI18n();
  const shop = useShop();
  const board = shop.snapshot?.board ?? DEFAULT_BOARD;
  const here = columnOf(board, order)?.id ?? "";
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const to = chosen && chosen !== here ? chosen : "";

  const move = () => {
    if (!to) return;
    setBusy(true);
    setMessage(null);
    shop
      .moveOrderTo(order, to)
      .then((moved) => {
        setChosen("");
        setMessage({ text: t("moveDone"), failed: false });
        onMoved(moved);
      })
      .catch((error: unknown) => setMessage({ text: messageForError(isDanError(error) ? error.code : undefined, t, error instanceof Error ? error.message : undefined), failed: true }))
      .finally(() => setBusy(false));
  };

  return (
    <section aria-labelledby="move-title" data-testid="order-move">
      <h2 id="move-title" className="font-display text-2xl">
        {t("moveTitle")}
      </h2>
      <p className="mt-1 mb-3 text-sm text-ink-soft">{t("moveLede")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label>
          <span className="block font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase">{t("moveColumn")}</span>
          <select value={to || here} onChange={(event) => setChosen(event.target.value)} className="mt-1 min-h-11 border border-rule bg-paper-raised px-3" data-testid="move-column">
            {board.columns.map((column) => (
              <option key={column.id} value={column.id}>
                {columnName(column, locale)}
                {column.id === here ? ` (${t("moveHere")})` : ""}
              </option>
            ))}
          </select>
        </label>
        <Button variant="line" disabled={busy || !to} onClick={move}>
          {t("moveGo")}
        </Button>
        {message ? (
          <p className={`text-sm ${message.failed ? "text-accent-ink" : "text-ink-soft"}`} role={message.failed ? "alert" : "status"} data-testid="move-status">
            {message.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** The record of the owner's changes to one order, newest first. */
function Record({ orderId, recordKey, now }: { orderId: string; recordKey: string; now: number }) {
  const { t, locale } = useI18n();
  const shop = useShop();
  const [loaded, setLoaded] = useState<{ key: string; edits: OrderEdit[]; error: string | null } | null>(null);
  const load = useEffectEvent(() => shop.loadOrderEdits(orderId));
  const key = `${orderId}:${recordKey}`;

  useEffect(() => {
    let stale = false;
    load().then(
      (edits) => !stale && setLoaded({ key, edits, error: null }),
      (error: unknown) => !stale && setLoaded({ key, edits: [], error: error instanceof Error ? error.message : "" }),
    );
    return () => {
      stale = true;
    };
  }, [key]);

  // The last list stays on screen while a newer one is fetched.
  const edits = loaded && loaded.key.startsWith(`${orderId}:`) ? loaded.edits : null;
  const empty = (value: string) => value || `(${t("recordEmpty")})`;

  return (
    <section aria-labelledby="record-title" data-testid="order-record">
      <h2 id="record-title" className="font-display text-2xl">
        {t("recordTitle")}
      </h2>
      {loaded?.error ? (
        <p className="mt-2 border-l-2 border-accent pl-3 text-sm" role="alert">
          {messageForError(undefined, t, loaded.error)}
        </p>
      ) : edits === null ? (
        <p className="mt-2 text-ink-soft">{t("orderLoading")}</p>
      ) : edits.length === 0 ? (
        <p className="mt-2 text-ink-soft" data-testid="record-none">
          {t("recordNone")}
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-rule border-y border-rule">
          {[...edits].reverse().map((edit) => (
            <li key={edit.id} className="py-3" data-testid="record-entry" data-kind={edit.kind}>
              <p className="font-display text-sm tracking-[0.08em] text-ink-soft">
                {listTime(edit.at, new Date(now), locale)} · {edit.byName}
              </p>
              <ul className="mt-1 space-y-0.5">
                {edit.changes.map((change) => (
                  <li key={change.field}>
                    {edit.kind === "move" ? (
                      <>
                        {t("recordMoved")}: {empty(change.before)} → {change.after}
                      </>
                    ) : (
                      <>
                        {t(FIELD_LABEL[change.field] ?? "editNote")}: {empty(change.before)} → {empty(change.after)}
                      </>
                    )}
                  </li>
                ))}
                {edit.lines.map((line) => {
                  const delta = line.afterQty - line.beforeQty;
                  return (
                    <li key={line.number}>
                      <span className="font-display">
                        {delta > 0 ? "+" : "−"}
                        {Math.abs(delta)} ×
                      </span>{" "}
                      <span className="font-display text-accent-ink">{line.number}</span> {primaryName(line.nameEn, line.nameZh, locale)}{" "}
                      <span className="text-sm text-ink-soft">({line.afterQty === 0 ? t("recordRemoved") : `${t("recordNow")} ${line.afterQty}`})</span>
                    </li>
                  );
                })}
                {edit.totalBeforePence !== edit.totalAfterPence ? (
                  <li>
                    {t("editBill")}: {formatPence(edit.totalBeforePence)} → {formatPence(edit.totalAfterPence)}
                  </li>
                ) : null}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
