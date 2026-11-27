"use client";

import { TicketSounds } from "./ticket-sounds";
import Link from "next/link";
import { useEffect, useState } from "react";
import { isDanError } from "@/lib/errors";
import { FEATURES } from "@/lib/features";
import { ago, formatPence, fulfilmentLabel, paymentLabel, orderLabel, phoneDigits, primaryName, secondaryName } from "@/lib/format";
import { useI18n, type CopyKey } from "@/lib/i18n";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { useTapGuard, type TapGuard } from "@/lib/tap-guard";
import { useBoardColour } from "@/lib/use-board-colour";
import { backStep, columnGloss, columnName, columnOf, DEFAULT_BOARD, nextStep, type Board, type NextStep } from "@/lib/board";
import type { Order } from "@/lib/types";
import { Button, PageTitle } from "./ui";
import { AwaitingTransfers } from "./awaiting-transfers";
import { CourierPanel, RefundFailures } from "./courier-panel";
import { ReprintButton } from "./print-strip";
import { WhereStrip } from "./where-strip";
import { OrdersList } from "./orders-list";
import { PaidDifference } from "./paid-difference";
import { RefundNote } from "./refund-note";
import { CREATE_ORDER_ROUTE } from "@/lib/focus";
import { writePersisted } from "@/lib/storage";

/**
 * The Orders page: every order, as the board or as a list (kept per device),
 * with Create order beside the choice. A tablet locked to the orders board
 * shows the board, and nothing else.
 */
export function OrdersScreen() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const locked = shop.persisted.focus?.position === "board";
  const layout = locked ? "board" : shop.persisted.ordersLayout;
  // Create order goes with the till, as the owner set it under Ordering & payments.
  const tillOn = shop.snapshot?.ordering.settings.till ?? true;

  return (
    <div data-orders-layout={layout}>
      {locked ? null : <PageTitle className="mb-4" title={t("ordersTitle")} gloss={locale === "zh-Hant" ? "Orders" : "訂單"} />}
      {locked ? null : (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex" role="group" aria-label={t("ordersLayout")}>
            {(["board", "list"] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={layout === choice}
                className={`min-h-11 min-w-20 cursor-pointer border px-4 font-display active:scale-[0.97] ${layout === choice ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft hover:bg-paper-deep"}`}
                onClick={() => writePersisted({ ordersLayout: choice })}
                data-testid={`orders-layout-${choice}`}
              >
                {t(choice === "board" ? "ordersBoard" : "ordersList")}
              </button>
            ))}
          </div>
          {tillOn ? (
            <Link
              href={CREATE_ORDER_ROUTE}
              className="inline-flex min-h-11 items-center justify-center bg-accent px-4 font-display text-lg leading-none text-on-accent transition-transform duration-75 hover:bg-accent-deep active:scale-[0.97]"
              data-testid="create-order"
            >
              {t("createOrder")}
            </Link>
          ) : null}
        </div>
      )}
      {shop.persisted.session?.mode === "demo" ? <p className="mb-5 text-sm text-ink-soft">{t("ordersDemoNote")}</p> : null}
      <TicketSounds place="counter" />
      <AwaitingTransfers />
      {/* Every order, cancelled ones included: that is where a refund fails. */}
      <RefundFailures orders={shop.snapshot?.orders ?? []} />
      {layout === "list" ? <OrdersList /> : <OrdersBoard />}
    </div>
  );
}

function OrdersBoard() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const board = shop.snapshot?.board ?? DEFAULT_BOARD;
  const shown = useBoardColour();
  const [chosen, setFocus] = useState<string>(board.columns[0].id);
  // A column removed meanwhile: back to the first.
  const focus = board.columns.some((column) => column.id === chosen) ? chosen : board.columns[0].id;
  const [now, setNow] = useState(() => Date.now());
  const [cardError, setCardError] = useState<string | null>(null);
  const guard = useTapGuard();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const orders = (shop.snapshot?.orders ?? []).filter((order) => order.status !== "cancelled");
  const inColumn = (id: string) => orders.filter((order) => columnOf(board, order)?.id === id);
  const customers = shop.snapshot?.customers ?? [];
  const locked = shop.persisted.focus?.position === "board";

  return (
    <div>
      {cardError ? (
        <p className="mb-4 border-l-2 border-accent pl-3 text-sm" role="alert">
          {cardError}
        </p>
      ) : null}

      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 md:hidden">
        {board.columns.map((column) => (
          <button
            key={column.id}
            type="button"
            aria-pressed={focus === column.id}
            className={`min-h-11 min-w-[4.75rem] flex-1 cursor-pointer border px-1 py-1 text-center font-display text-sm leading-tight ${focus === column.id ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft"}`}
            onClick={() => setFocus(column.id)}
          >
            {columnName(column, locale)}
            <span className="mt-0.5 block">{inColumn(column.id).length}</span>
          </button>
        ))}
      </div>

      <div
        className="gap-6 md:grid md:overflow-x-auto"
        style={{ gridTemplateColumns: `repeat(${board.columns.length}, minmax(${board.columns.length > 4 ? "12.5rem" : "0"}, 1fr))` }}
      >
        {board.columns.map((column) => {
          const list = inColumn(column.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
          return (
            <section key={column.id} className={focus === column.id ? "" : "hidden md:block"} aria-label={columnName(column, locale)} data-column={column.id}>
              <div className="mb-3 flex items-baseline justify-between border-b-[3px] pb-2" style={{ borderColor: shown(column.colour) }}>
                <h2 className="font-display text-2xl leading-none">
                  {columnName(column, locale)}
                  {columnGloss(column, locale) ? <span className="ml-2 font-zh text-sm text-ink-soft">{columnGloss(column, locale)}</span> : null}
                </h2>
                <span className="font-display text-ink-soft">{list.length}</span>
              </div>
              <div className="space-y-3">
                {list.length === 0 ? <p className="text-sm text-ink-soft">{t("emptyColumn")}</p> : null}
                {list.map((order) => (
                  <Docket
                    key={order.id}
                    order={order}
                    board={board}
                    colour={shown(column.colour)}
                    now={now}
                    rewardReady={customers.some((customer) => customer.id === phoneDigits(order.phone) && customer.stamps >= 10)}
                    locked={locked}
                    guard={guard}
                    onError={setCardError}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** One order as a docket: on the board, and under its row in the list. */
export function Docket({
  order,
  board,
  colour,
  now,
  rewardReady,
  locked,
  guard,
  onError,
  ticketLink = true,
  editLink = true,
}: {
  order: Order;
  board: Board;
  /** The column's colour: the docket's top border. */
  colour: string;
  now: number;
  rewardReady: boolean;
  /** In focus mode: where the food goes, big, at the top; no links away. */
  locked: boolean;
  guard: TapGuard;
  onError: (message: string | null) => void;
  /** False for an order the ticket page does not have (older than the board's orders). */
  ticketLink?: boolean;
  /** False on the order's own page. */
  editLink?: boolean;
}) {
  const isOwner = useIsOwner();
  const { t, locale } = useI18n();
  const shop = useShop();
  const [busy, setBusy] = useState(false);
  const step = nextStep(board, order);
  const next = step ? { label: stepLabel(step, order, t, locale) } : null;
  const back = backStep(board, order);
  const problem = Boolean(order.courier?.problem);

  return (
    <div className="torn-wrap">
      <article
        className={`torn border border-b-0 border-t-[3px] border-rule bg-paper-raised px-3 py-3 ${problem ? "border-t-accent" : ""}`}
        style={problem ? undefined : { borderTopColor: colour }}
      >
        {locked ? (
          <div className="mb-2">
            <WhereStrip order={order} size="board" />
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-2xl leading-none" data-testid="docket-number">
            {orderLabel(order.number, t("numberWaiting"))}
            {/* The owner changed it after it was placed: everyone can see that it was. */}
            {order.status === "cancelled" ? (
              <span className="ml-2 bg-ink px-1 py-0.5 align-middle font-display text-[0.7rem] tracking-[0.12em] text-paper uppercase" data-testid="docket-cancelled">
                {t("statusCancelled")}
              </span>
            ) : order.editCount ? (
              <span className="ml-2 border border-ink px-1 py-0.5 align-middle font-display text-[0.7rem] tracking-[0.12em] uppercase" data-testid="docket-changed">
                {t("changedMark")}
              </span>
            ) : null}
          </h3>
          <p className="text-sm text-ink-soft">{ago(order.createdAt, now, locale, t("justNow"))}</p>
        </div>
        <p className="mt-2 font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase">
          {t(order.source === "online" ? "sourceOnline" : order.source === "phone" ? "sourcePhone" : "sourceCounter")}
          {order.fulfilment === "eat_in" ? null : ` · ${fulfilmentLabel(order, t)}`}
        </p>
        {order.fulfilment === "eat_in" ? (
          <p data-testid="docket-table" className="mt-1 font-display text-lg leading-tight">
            {fulfilmentLabel(order, t)}
          </p>
        ) : null}
        {order.payment ? (
          <p
            data-testid="docket-payment"
            className={`mt-2 inline-block px-1.5 py-0.5 font-display text-sm leading-tight ${order.payment.status === "paid" ? "bg-ink text-paper" : "border border-accent text-accent-ink"}`}
          >
            {paymentLabel(order, t)?.text}
          </p>
        ) : null}
        <ul className="mt-3 space-y-1">
          {order.lines.map((line) => (
            <li key={`${line.number}-${line.nameEn}`} className="flex gap-2 text-sm">
              <span className="font-display text-accent-ink">{line.number}</span>
              <span className="min-w-0 flex-1">
                {primaryName(line.nameEn, line.nameZh, locale)}
                <span className="ml-2 font-zh text-ink-soft">{secondaryName(line.nameEn, line.nameZh, locale)}</span>
              </span>
              <span>×{line.qty}</span>
            </li>
          ))}
        </ul>
        {order.customerName || order.phone ? (
          <p className="mt-3 text-sm">
            {order.customerName}
            {order.phone ? <span className="text-ink-soft"> · {order.phone}</span> : null}
          </p>
        ) : null}
        {order.address ? <p className="text-sm text-ink-soft">{order.address}</p> : null}
        {order.notes ? <p className="mt-1 text-sm italic text-ink-soft">{order.notes}</p> : null}
        <p className="mt-3 font-display text-xl">
          {formatPence(order.totalPence)}
          {order.deliveryFeePence ? (
            <span className="ml-2 font-body text-sm text-ink-soft">
              {t("deliveryFeeShort")} {formatPence(order.deliveryFeePence)}
            </span>
          ) : null}
        </p>
        <PaidDifference order={order} className="mt-2" />
        <RefundNote order={order} className="mt-2" />
        <CourierPanel order={order} uberReady={shop.snapshot?.ordering.uberReady ?? false} guard={guard} onError={onError} />
        <div className="mt-3 flex flex-wrap gap-2">
          {next ? (
            <Button
              variant="accent"
              disabled={busy}
              onClick={() => {
                const done = guard.run(() => shop.advanceOrder(order));
                if (!done) return;
                setBusy(true);
                onError(null);
                void done.catch((error: unknown) => {
                  onError(isDanError(error) ? error.message : t("errGeneric"));
                }).finally(() => setBusy(false));
              }}
            >
              {next.label}
            </Button>
          ) : null}
          {back ? (
            <Button
              variant="line"
              disabled={busy}
              aria-label={`${t("sendBackTo")} ${columnName(back, locale)}`}
              onClick={() => {
                const done = guard.run(() => shop.sendBack(order));
                if (!done) return;
                setBusy(true);
                onError(null);
                void done.catch((error: unknown) => onError(isDanError(error) ? error.message : t("errGeneric"))).finally(() => setBusy(false));
              }}
            >
              ← {columnName(back, locale)}
            </Button>
          ) : null}
          <ReprintButton orderId={order.id} />
          {isOwner && editLink && !locked && order.status !== "cancelled" ? (
            <Link href={`/shop/orders/${order.id}`} className="inline-flex min-h-11 items-center px-2 font-display text-ink-soft" data-testid="docket-edit">
              {t("editLink")}
            </Link>
          ) : null}
          {locked || !ticketLink ? null : (
            <Link href={`/shop/ticket?order=${order.id}`} className="inline-flex min-h-11 items-center px-2 font-display text-ink-soft">
              {t("viewTicket")}
            </Link>
          )}
          {FEATURES.stamps && order.phone ? (
            rewardReady ? (
              <Link href="/shop/loyalty" className="inline-flex min-h-11 items-center px-2 font-display text-accent-ink">
                {t("rewardWaiting")}
              </Link>
            ) : (
              <Button
                variant="line"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  onError(null);
                  void shop.addStamp(order.phone).catch((error: unknown) => {
                    onError(isDanError(error) ? error.message : t("errGeneric"));
                  }).finally(() => setBusy(false));
                }}
              >
                {t("stampThis")}
              </Button>
            )
          ) : null}
        </div>
      </article>
    </div>
  );
}

/** What a ticket's next-step button says, on the board, the kitchen and the pass. */
export function stepLabel(step: NextStep, order: Order, t: (key: CopyKey) => string, locale: string): string {
  if (step.kind === "accept") return t("accept");
  if (step.kind === "ready") return t("markReady");
  if (step.kind === "done") return order.fulfilment === "delivery" ? t("delivered") : order.fulfilment === "eat_in" ? t("served") : t("collected");
  return `${t("moveTo")} ${columnName(step.column, locale)}`;
}
