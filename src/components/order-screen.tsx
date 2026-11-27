"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { columnName, columnOf, DEFAULT_BOARD } from "@/lib/board";
import { amountLabel, signedPence } from "@/lib/addons";
import { dishesFor, draftKey } from "@/lib/create-order";
import { isDanError } from "@/lib/errors";
import { formatPence, orderLabel, primaryName, secondaryName } from "@/lib/format";
import { listTime } from "@/lib/history";
import { messageForError, useI18n, type CopyKey } from "@/lib/i18n";
import { applyEdit, cancelPlan, courierBooked, newLines, paidDifference, type OrderEdit, type OrderEditInput } from "@/lib/order-edit";
import { chosen, lineSignature, lineTotal, optionsFor } from "@/lib/pricing";
import { lineDetails } from "@/lib/ticket";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { useTapGuard } from "@/lib/tap-guard";
import { useBoardColour } from "@/lib/use-board-colour";
import type { Addon, MenuItem, Order } from "@/lib/types";
import { DishChooser, type DishChoice } from "./dish-chooser";
import { LineDetails } from "./line-details";
import { Docket } from "./orders-board";
import { PaidDifference } from "./paid-difference";
import { Button, PageTitle } from "./ui";

/** A line in the owner's draft: the dish, how many, and how it is taken (the ids of its choices and its add-ons). */
type DraftLine = { key: string; number: number; qty: number; options: string[]; addons: string[] };
type Draft = { customerName: string; phone: string; address: string; table: string; notes: string; lines: DraftLine[]; addons: string[] };

const draftOf = (order: Order): Draft => ({
  customerName: order.customerName,
  phone: order.phone,
  address: order.address,
  table: order.table ?? "",
  notes: order.notes,
  lines: order.lines.map((line) => ({
    key: lineSignature(line),
    number: line.number,
    qty: line.qty,
    options: (line.options ?? []).map((option) => option.choiceId),
    addons: (line.addons ?? []).map((addon) => addon.id),
  })),
  addons: (order.addons ?? []).map((addon) => addon.id),
});

/**
 * What the owner's draft asks for: only what an order of that kind has.
 * `explicit`: the shop has options or add-ons, or the order carries some, so
 * each line says exactly how it is taken. Otherwise a line is a dish and how
 * many, as every shop server understands.
 */
function inputOf(order: Order, draft: Draft, explicit: boolean): OrderEditInput {
  const sold = (order.addons ?? []).map((addon) => addon.id);
  const sameAddons = sold.length === draft.addons.length && sold.every((id) => draft.addons.includes(id));
  return {
    customerName: draft.customerName,
    phone: draft.phone,
    notes: draft.notes,
    address: draft.address,
    ...(order.fulfilment === "eat_in" ? { table: draft.table } : {}),
    lines: draft.lines.map((line) => (explicit ? { number: line.number, qty: line.qty, options: line.options, addons: line.addons } : { number: line.number, qty: line.qty })),
    // The bill's add-ons are named only when the owner has changed them.
    ...(sameAddons ? {} : { addons: draft.addons }),
  };
}

const FIELD_LABEL: Record<string, CopyKey> = { customerName: "editName", phone: "editPhone", address: "editAddress", notes: "editNote", table: "table", column: "moveColumn", addons: "editAddons" };

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
          {/* Who took it: the owner's only (DAN-44). */}
          {isOwner && (order.takenBy || order.source === "online") ? (
            <p className="font-display" data-testid="order-taken-by">
              <span className="text-ink-soft">{t("orderTakenBy")}</span> {order.takenBy?.name ?? t("orderTakenOnline")}
            </p>
          ) : null}
          {!isOwner ? (
            <p className="border-l-2 border-accent pl-3" data-testid="order-owner-only">
              {t("orderOwnerOnly")}
            </p>
          ) : order.status === "cancelled" ? (
            // Where its money stands is on the docket beside this.
            <p className="border-l-2 border-accent pl-3" data-testid="order-cancelled-note">
              {t("orderCancelledNote")}
            </p>
          ) : (
            <>
              {/* A new editor for each saved state of the order, so the form always starts from what is saved. */}
              <OrderEditor key={`${order.id}:${order.editCount ?? 0}`} order={order} justSaved={savedCount === (order.editCount ?? 0)} onSaved={saved} />
              <MoveTicket order={order} onMoved={changed} />
              <CancelOrder order={order} onCancelled={changed} />
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
  const allAddons = useMemo(() => shop.snapshot?.addons ?? [], [shop.snapshot?.addons]);
  // The owner may put any add-on on, whatever kind of order it is offered for.
  const dishAddons = useMemo(() => allAddons.filter((addon) => addon.scope === "dish"), [allAddons]);
  const [choosing, setChoosing] = useState<MenuItem | null>(null);
  const explicit =
    allAddons.length > 0 ||
    items.some((item) => (item.options?.length ?? 0) > 0) ||
    (order.addons?.length ?? 0) > 0 ||
    order.lines.some((line) => (line.options?.length ?? 0) > 0 || (line.addons?.length ?? 0) > 0);
  const input = useMemo(() => inputOf(order, draft, explicit), [order, draft, explicit]);

  const setQty = (key: string, delta: number) =>
    edit({ lines: draft.lines.flatMap((line) => (line.key !== key ? [line] : line.qty + delta <= 0 ? [] : [{ ...line, qty: Math.min(99, line.qty + delta) }])) });
  /** Puts a dish on the draft as chosen: more of a line taken the same way, or a new line. */
  const addLine = (item: MenuItem, choice: DishChoice) => {
    const key = draftKey({ number: item.number, options: choice.options, addons: choice.addons });
    if (draft.lines.some((line) => line.key === key)) return setQty(key, choice.qty);
    edit({ lines: [...draft.lines, { key, number: item.number, qty: choice.qty, options: choice.options, addons: choice.addons }] });
  };
  const addDish = (item: MenuItem) => {
    setSearch("");
    // A dish with options, or a shop with add-ons for a dish: the owner says how it is taken.
    if ((item.options?.length ?? 0) > 0 || dishAddons.length > 0) return setChoosing(item);
    addLine(item, { options: [], addons: [], qty: 1 });
  };
  /** What a new line starts with: the first of each "choose one", and the add-ons ticked by default for this kind of order. */
  const startFor = (item: MenuItem): DishChoice => ({
    options: optionsFor(item, []).map((option) => option.choiceId),
    addons: chosen(allAddons, "dish", order.source === "online" ? "online" : "local").map((addon) => addon.id),
    qty: 1,
  });

  // What saving would do, worked out by the server's own rules; or why it would be refused.
  const preview = useMemo(() => {
    try {
      return { applied: applyEdit(order, input, items, allAddons, locked), problem: null };
    } catch (error) {
      const text =
        draft.lines.length === 0
          ? t("editNeedsDish")
          : order.fulfilment === "delivery" && !draft.address.trim()
            ? t("editNeedsAddress")
            : messageForError(isDanError(error) ? error.code : undefined, t, error instanceof Error ? error.message : undefined);
      return { applied: null, problem: text };
    }
  }, [order, input, draft, items, allAddons, locked, t]);
  // The draft's lines priced: one already on the order as it was sold, a new one from the menu now.
  const shown = useMemo(() => {
    try {
      return draft.lines.length > 0 ? newLines(order, input.lines ?? [], items, allAddons) : [];
    } catch {
      return null;
    }
  }, [order, input, draft.lines.length, items, allAddons]);
  const dirty = Boolean(preview.problem) || Boolean(preview.applied && (preview.applied.changes.length > 0 || preview.applied.lines.length > 0));
  const total = preview.applied?.order.totalPence ?? order.totalPence;
  const difference = preview.applied ? paidDifference(preview.applied.order) : null;
  const matches = search.trim() ? dishesFor(items, categories, null, search).slice(0, 6) : [];
  // The add-ons the bill can carry: the ones on it (as they were sold), then the shop's others.
  const onBill = order.addons ?? [];
  const billChoices: { id: string; nameEn: string; nameZh: string; kind: Addon["kind"]; value: number; sold: boolean }[] = [
    ...onBill.map((addon) => ({ ...addon, sold: true })),
    ...allAddons.filter((addon) => addon.scope === "bill" && !onBill.some((sold) => sold.id === addon.id)).map((addon) => ({ ...addon, sold: false })),
  ];
  const billNow = preview.applied?.order.addons ?? onBill;

  const save = () => {
    if (preview.problem) return setMessage({ text: preview.problem, failed: true });
    setBusy(true);
    setMessage(null);
    shop
      .editOrder(order.id, input)
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
        {draft.lines.map((line, at) => {
          const priced = shown?.[at];
          const item = items.find((entry) => entry.number === line.number);
          const named = priced ?? order.lines.find((sold) => lineSignature(sold) === line.key) ?? item;
          return (
            <li key={line.key} className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 py-2" data-testid="edit-line" data-number={line.number}>
              <span className="w-10 font-display text-xl text-accent-ink">{line.number}</span>
              <span className="min-w-[7rem] flex-1">
                <span className="block leading-tight">{named ? primaryName(named.nameEn, named.nameZh, locale) : ""}</span>
                <span className="font-zh text-sm text-ink-soft">{named ? secondaryName(named.nameEn, named.nameZh, locale) : ""}</span>
                {priced ? <LineDetails details={lineDetails(priced)} /> : null}
              </span>
              <span className="flex items-center gap-1">
                <QtyButton label="−" name={`${t("editDishes")} ${line.number} −`} onClick={() => setQty(line.key, -1)} />
                <span className="w-6 text-center font-display" data-testid="edit-qty">
                  {line.qty}
                </span>
                <QtyButton label="+" name={`${t("editDishes")} ${line.number} +`} onClick={() => setQty(line.key, 1)} />
              </span>
              <span className="w-16 text-right font-display" data-testid="edit-line-total">
                {priced ? formatPence(lineTotal(priced)) : "—"}
              </span>
              <button type="button" className="min-h-11 min-w-11 cursor-pointer px-1 text-sm text-ink-soft active:text-ink" onClick={() => edit({ lines: draft.lines.filter((entry) => entry.key !== line.key) })}>
                {t("tillRemove")}
              </button>
            </li>
          );
        })}
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

      {billChoices.length > 0 ? (
        <fieldset className="mt-6" data-testid="edit-addons">
          <legend className="font-display text-lg">{t("editAddons")}</legend>
          <p className="text-sm text-ink-soft">{t("editAddonsNote")}</p>
          <div className="mt-2 divide-y divide-rule border-y border-rule">
            {billChoices.map((addon) => {
              const ticked = draft.addons.includes(addon.id);
              const applied = billNow.find((entry) => entry.id === addon.id);
              return (
                <label key={addon.id} className="flex min-h-11 cursor-pointer items-center gap-3 py-1">
                  <input
                    type="checkbox"
                    checked={ticked}
                    onChange={() => edit({ addons: ticked ? draft.addons.filter((id) => id !== addon.id) : [...draft.addons, addon.id] })}
                    data-testid="edit-addon"
                    data-addon={addon.id}
                  />
                  <span className="min-w-0 flex-1">
                    {primaryName(addon.nameEn, addon.nameZh, locale)}
                    <span className="ml-2 text-sm text-ink-soft">
                      {amountLabel(addon)}
                      {addon.sold ? ` · ${t("editAsSold")}` : ""}
                    </span>
                  </span>
                  <span className="w-20 text-right font-display" data-testid="edit-addon-amount">
                    {ticked && applied ? signedPence(applied.amountPence) : ""}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
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
      {choosing ? (
        <DishChooser
          key={choosing.id}
          item={choosing}
          menu={items}
          dishAddons={dishAddons}
          lockRequired={false}
          start={startFor(choosing)}
          confirmLabel={t("chooseAdd")}
          onConfirm={(choice) => {
            addLine(choosing, choice);
            setChoosing(null);
          }}
          onClose={() => setChoosing(null)}
        />
      ) : null}
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

/**
 * The owner calls an order off for good. What will happen to money already
 * paid online is said first; the second tap names the order and the refund.
 */
function CancelOrder({ order, onCancelled }: { order: Order; onCancelled: (order: Order) => void }) {
  const { t } = useI18n();
  const shop = useShop();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = cancelPlan(order);
  const number = orderLabel(order.number, t("numberWaiting"));
  const printers = order.status !== "completed";

  const cancel = () => {
    setBusy(true);
    setError(null);
    shop
      .cancelOrder(order.id)
      .then(onCancelled)
      .catch((caught: unknown) => {
        setError(messageForError(isDanError(caught) ? caught.code : undefined, t, caught instanceof Error ? caught.message : undefined));
        setBusy(false);
      });
  };

  return (
    <section aria-labelledby="cancel-title" data-testid="order-cancel">
      <h2 id="cancel-title" className="font-display text-2xl">
        {t("cancelTitle")}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">{t("cancelLede")}</p>
      <ul className="mt-3 space-y-1" data-testid="cancel-plan" data-refund={plan.kind}>
        <li>
          {plan.kind === "card" ? (
            <>
              <strong className="font-display">{formatPence(plan.pence)}</strong> {t("cancelCard")}
            </>
          ) : plan.kind === "bank" ? (
            <>
              {t("cancelBank")} <strong className="font-display">{formatPence(plan.pence)}</strong>.
            </>
          ) : (
            t("cancelNone")
          )}
        </li>
        {courierBooked(order) ? <li>{t("cancelCallsOffCourier")}</li> : null}
        {printers ? <li className="text-sm text-ink-soft">{t("cancelKitchen")}</li> : null}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {asking ? (
          <>
            <Button variant="accent" disabled={busy} onClick={cancel} data-testid="cancel-confirm">
              {t("cancelYes")} {number}
              {plan.kind === "card" ? ` ${t("cancelAndRefund")} ${formatPence(plan.pence)}` : ""}
            </Button>
            <Button variant="line" disabled={busy} onClick={() => setAsking(false)}>
              {t("cancelKeep")}
            </Button>
          </>
        ) : (
          <Button variant="line" onClick={() => setAsking(true)} data-testid="cancel-start">
            {t("cancelOrder")}
          </Button>
        )}
        {error ? (
          <p className="text-sm text-accent-ink" role="alert" data-testid="cancel-error">
            {error}
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
                    {edit.kind === "cancel" ? (
                      change.field === "refund" ? (
                        <>
                          {t("recordRefund")}: {formatPence(Number(change.after) || 0)}
                        </>
                      ) : (
                        <>
                          {t("recordCancelled")}
                          {change.before ? ` (${t("recordWasIn")} ${change.before})` : ""}
                        </>
                      )
                    ) : edit.kind === "move" ? (
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
                    <li key={`${line.number}:${line.detail ?? ""}`}>
                      <span className="font-display">
                        {delta > 0 ? "+" : "−"}
                        {Math.abs(delta)} ×
                      </span>{" "}
                      <span className="font-display text-accent-ink">{line.number}</span> {primaryName(line.nameEn, line.nameZh, locale)}
                      {/* Which line of the dish: the one taken this way. */}
                      {line.detail ? <span data-testid="record-detail"> ({line.detail})</span> : null}{" "}
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
