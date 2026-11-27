"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { columnName, columnOf, DEFAULT_BOARD, type Board } from "@/lib/board";
import { isDanError } from "@/lib/errors";
import { dayKey, formatPence, fulfilmentLabel, orderLabel, paymentLabel } from "@/lib/format";
import { listTime, mergeRows, STATUS_CHOICES, withLive, type OrderHistoryFilter, type StatusChoice } from "@/lib/history";
import { messageForError, useI18n, type CopyKey } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import { useTapGuard } from "@/lib/tap-guard";
import { useBoardColour } from "@/lib/use-board-colour";
import type { Order } from "@/lib/types";
import { Docket } from "./orders-board";
import { Button } from "./ui";

const WHICH_LABEL: Record<StatusChoice, CopyKey> = { all: "listAll", open: "listOpen", completed: "statusCompleted", cancelled: "statusCancelled" };
const COLUMNS = "md:grid-cols-[4.5rem_7.5rem_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_5.5rem]";

type Loaded = { key: string; rows: Order[]; next: string | null; pages: number; error: string | null };

/** A value that settles a moment after the last change: the search box, so each letter is not a request. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * Orders as a list: newest first, back through every order the shop has.
 * Search by number, name or phone; narrow to a day and to open, completed
 * or cancelled orders. A row opens the order's docket.
 */
export function OrdersList() {
  const { t } = useI18n();
  const shop = useShop();
  const board = shop.snapshot?.board ?? DEFAULT_BOARD;
  const live = useMemo(() => shop.snapshot?.orders ?? [], [shop.snapshot?.orders]);
  const guard = useTapGuard();
  const [search, setSearch] = useState("");
  const [day, setDay] = useState("");
  const [which, setWhich] = useState<StatusChoice>("all");
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const settledSearch = useSettled(search, 300);
  const filter: OrderHistoryFilter = useMemo(() => ({ search: settledSearch.trim(), day, status: [...STATUS_CHOICES[which]] }), [settledSearch, day, which]);
  const key = JSON.stringify(filter);
  // A new order on the board is a new first row here too.
  const newest = live[0]?.id ?? "";

  const fail = (error: unknown) => messageForError(isDanError(error) ? error.code : undefined, t, error instanceof Error ? error.message : undefined);
  const loadFirst = useEffectEvent(() => shop.loadOrderHistory(filter));

  useEffect(() => {
    let stale = false;
    loadFirst().then(
      (page) => {
        if (stale) return;
        setLoaded((current) =>
          // The same list, refreshed: keep the older pages already shown.
          current && current.key === key && !current.error
            ? { ...current, rows: mergeRows(current.rows, page.orders), next: current.pages > 1 ? current.next : page.next }
            : { key, rows: page.orders, next: page.next, pages: 1, error: null },
        );
      },
      (error: unknown) => {
        if (!stale) setLoaded({ key, rows: [], next: null, pages: 1, error: fail(error) });
      },
    );
    return () => {
      stale = true;
    };
    // `fail` only words the error; the list follows the filter and the newest order.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, newest]);

  const current = loaded?.key === key ? loaded : null;
  const rows = useMemo(() => withLive(current?.rows ?? [], live), [current?.rows, live]);

  const more = () => {
    if (!current?.next || loadingMore) return;
    setLoadingMore(true);
    shop
      .loadOrderHistory(filter, current.next)
      .then((page) => setLoaded((latest) => (latest && latest.key === key ? { ...latest, rows: mergeRows(latest.rows, page.orders), next: page.next, pages: latest.pages + 1 } : latest)))
      .catch((error: unknown) => setCardError(fail(error)))
      .finally(() => setLoadingMore(false));
  };

  const field = "min-h-11 border border-rule bg-paper-raised px-3";
  const label = "block font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase";
  const today = dayKey(now);

  return (
    <div data-testid="orders-list">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 basis-64">
          <span className={label}>{t("listSearch")}</span>
          <input type="search" value={search} maxLength={60} onChange={(event) => setSearch(event.target.value)} className={`mt-1 w-full ${field}`} data-testid="list-search" />
        </label>
        <label>
          <span className={label}>{t("listDay")}</span>
          <input type="date" value={day} max={today} onChange={(event) => setDay(event.target.value)} className={`mt-1 ${field}`} data-testid="list-day" />
        </label>
        <div className="flex gap-2">
          <Button variant={day === today ? "ink" : "line"} aria-pressed={day === today} onClick={() => setDay(day === today ? "" : today)}>
            {t("listToday")}
          </Button>
          {day ? (
            <Button variant="line" onClick={() => setDay("")}>
              {t("listAnyDay")}
            </Button>
          ) : null}
        </div>
        <label>
          <span className={label}>{t("listWhich")}</span>
          <select value={which} onChange={(event) => setWhich(event.target.value as StatusChoice)} className={`mt-1 ${field}`} data-testid="list-which">
            {(Object.keys(STATUS_CHOICES) as StatusChoice[]).map((choice) => (
              <option key={choice} value={choice}>
                {t(WHICH_LABEL[choice])}
              </option>
            ))}
          </select>
        </label>
      </div>

      {cardError ? (
        <p className="mb-4 border-l-2 border-accent pl-3 text-sm" role="alert">
          {cardError}
        </p>
      ) : null}
      {current?.error ? (
        <p className="mb-4 border-l-2 border-accent pl-3" role="alert" data-testid="list-error">
          {current.error}
        </p>
      ) : null}

      <div className={`hidden border-b-[3px] border-ink px-2 pb-2 font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase md:grid md:gap-3 ${COLUMNS}`} aria-hidden="true">
        <span>{t("listColNumber")}</span>
        <span>{t("listColTime")}</span>
        <span>{t("listColCustomer")}</span>
        <span>{t("listColType")}</span>
        <span>{t("listColWhere")}</span>
        <span>{t("listColPayment")}</span>
        <span className="text-right">{t("listColTotal")}</span>
      </div>
      <ul className="divide-y divide-rule border-b border-rule" aria-busy={!current} data-testid="list-rows">
        {rows.map((order) => (
          <Row
            key={order.id}
            order={order}
            board={board}
            now={now}
            open={open === order.id}
            onToggle={() => setOpen(open === order.id ? null : order.id)}
            // The ticket page knows the orders the board has; older ones are not there.
            ticketLink={live.some((entry) => entry.id === order.id)}
            guard={guard}
            onError={setCardError}
          />
        ))}
      </ul>
      {!current ? (
        <p className="py-6 text-ink-soft" data-testid="list-loading">
          {t("listLoading")}
        </p>
      ) : rows.length === 0 && !current.error ? (
        <p className="py-6 text-ink-soft" data-testid="list-none">
          {t("listNone")}
        </p>
      ) : null}
      {current && rows.length > 0 ? (
        <div className="mt-4">
          {current.next ? (
            <Button variant="line" disabled={loadingMore} onClick={more} data-testid="list-more">
              {t("listMore")}
            </Button>
          ) : (
            <p className="text-sm text-ink-soft" data-testid="list-end">
              {t("listEnd")}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );

}

function Row({
  order,
  board,
  now,
  open,
  onToggle,
  ticketLink,
  guard,
  onError,
}: {
  order: Order;
  board: Board;
  now: Date;
  open: boolean;
  onToggle: () => void;
  ticketLink: boolean;
  guard: ReturnType<typeof useTapGuard>;
  onError: (message: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const shown = useBoardColour();
  const column = order.status === "cancelled" ? null : columnOf(board, order);
  const where = order.status === "cancelled" ? t("statusCancelled") : column ? columnName(column, locale) : t("statusCompleted");
  const colour = column ? shown(column.colour) : "transparent";
  const customer = [order.customerName, order.phone].filter(Boolean).join(" · ");
  const type = fulfilmentLabel(order, t);
  const source = t(order.source === "online" ? "sourceOnline" : order.source === "phone" ? "sourcePhone" : "sourceCounter");
  const payment = paymentLabel(order, t)?.text ?? "";
  const time = listTime(order.createdAt, now, locale);
  const number = orderLabel(order.number, t("numberWaiting"));

  return (
    <li data-testid="list-row" data-order={order.id} data-status={order.status}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={`grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 px-2 py-3 text-left hover:bg-paper-deep active:bg-paper-deep md:gap-3 ${COLUMNS} ${order.status === "cancelled" ? "text-ink-soft" : ""}`}
      >
        <span className={`font-display text-xl leading-none ${order.status === "cancelled" ? "line-through" : ""}`} data-testid="list-number">
          {number}
        </span>
        <span className="order-4 col-span-3 text-sm text-ink-soft md:order-none md:col-span-1 md:text-base md:text-ink" data-testid="list-time">
          {time}
        </span>
        <span className="order-5 col-span-3 min-w-0 truncate text-sm md:order-none md:col-span-1 md:text-base" data-testid="list-customer">
          {customer || <span className="text-ink-soft">{t("listNoCustomer")}</span>}
        </span>
        <span className="order-6 col-span-3 min-w-0 truncate text-sm text-ink-soft md:order-none md:col-span-1 md:text-base md:text-ink">
          {type}
          <span className="ml-2 text-sm text-ink-soft">{source}</span>
          {/* Who took it: the server says only to the owner (DAN-44). */}
          {order.takenBy ? (
            <span className="ml-2 text-sm text-ink-soft" data-testid="list-taken-by">
              · {order.takenBy.name}
            </span>
          ) : null}
        </span>
        <span className="order-2 min-w-0 truncate md:order-none" data-testid="list-where">
          <span className="mr-2 inline-block size-2.5 align-middle" style={{ backgroundColor: colour }} aria-hidden="true" />
          {where}
        </span>
        <span className="order-7 col-span-3 min-w-0 truncate text-sm text-ink-soft md:order-none md:col-span-1">{payment}</span>
        <span className="order-3 text-right font-display md:order-none" data-testid="list-total">
          {formatPence(order.totalPence)}
        </span>
      </button>
      {open ? (
        <div className="max-w-md px-2 pb-4" data-testid="list-docket">
          <Docket order={order} board={board} colour={colour === "transparent" ? "var(--color-rule)" : colour} now={now.getTime()} rewardReady={false} locked={false} guard={guard} onError={onError} ticketLink={ticketLink} />
        </div>
      ) : null}
    </li>
  );
}
