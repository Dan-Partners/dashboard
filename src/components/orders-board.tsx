"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isDanError } from "@/lib/errors";
import { FEATURES } from "@/lib/features";
import { ago, formatPence, fulfilmentLabel, orderLabel, phoneDigits, primaryName, secondaryName } from "@/lib/format";
import { useI18n, type CopyKey } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import { useTapGuard, type TapGuard } from "@/lib/tap-guard";
import type { Order, OrderStatus } from "@/lib/types";
import { Button, PageTitle } from "./ui";
import { WhereStrip } from "./where-strip";

const COLUMNS: { status: OrderStatus; label: CopyKey }[] = [
  { status: "new", label: "statusNew" },
  { status: "preparing", label: "statusPreparing" },
  { status: "ready", label: "statusReady" },
  { status: "completed", label: "statusCompleted" },
];

export function OrdersBoard() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const [focus, setFocus] = useState<OrderStatus>("new");
  const [now, setNow] = useState(() => Date.now());
  const [cardError, setCardError] = useState<string | null>(null);
  const guard = useTapGuard();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const orders = shop.snapshot?.orders ?? [];
  const customers = shop.snapshot?.customers ?? [];
  const locked = shop.persisted.focus?.position === "board";

  return (
    <div>
      {locked ? null : <PageTitle title={t("ordersTitle")} gloss={locale === "zh-Hant" ? "Orders" : "訂單"} />}
      {shop.persisted.session?.mode === "demo" ? <p className="mb-5 text-sm text-ink-soft">{t("ordersDemoNote")}</p> : null}
      {cardError ? (
        <p className="mb-4 border-l-2 border-accent pl-3 text-sm" role="alert">
          {cardError}
        </p>
      ) : null}

      <div className="mb-4 grid grid-cols-4 gap-2 md:hidden">
        {COLUMNS.map((column) => (
          <button
            key={column.status}
            type="button"
            aria-pressed={focus === column.status}
            className={`min-h-11 cursor-pointer border px-1 py-1 text-center font-display text-sm leading-tight ${focus === column.status ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft"}`}
            onClick={() => setFocus(column.status)}
          >
            {t(column.label)}
            <span className="mt-0.5 block">{orders.filter((order) => order.status === column.status).length}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        {COLUMNS.map((column) => {
          const list = orders
            .filter((order) => order.status === column.status)
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
          return (
            <section key={column.status} className={focus === column.status ? "" : "hidden md:block"} aria-label={t(column.label)}>
              <div className="mb-3 flex items-baseline justify-between border-b border-ink pb-2">
                <h2 className="font-display text-2xl leading-none">{t(column.label)}</h2>
                <span className="font-display text-ink-soft">{list.length}</span>
              </div>
              <div className="space-y-3">
                {list.length === 0 ? <p className="text-sm text-ink-soft">{t("emptyColumn")}</p> : null}
                {list.map((order) => (
                  <Docket
                    key={order.id}
                    order={order}
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

function Docket({
  order,
  now,
  rewardReady,
  locked,
  guard,
  onError,
}: {
  order: Order;
  now: number;
  rewardReady: boolean;
  /** In focus mode: where the food goes, big, at the top; no links away. */
  locked: boolean;
  guard: TapGuard;
  onError: (message: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const shop = useShop();
  const [busy, setBusy] = useState(false);
  const next = nextStep(order, t);

  return (
    <div className="torn-wrap">
      <article className={`torn border border-b-0 border-rule bg-paper-raised px-3 py-3 ${order.status === "new" ? "border-t-[3px] border-t-accent" : "border-t-[3px] border-t-ink/15"}`}>
        {locked ? (
          <div className="mb-2">
            <WhereStrip order={order} size="board" />
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-2xl leading-none" data-testid="docket-number">
            {orderLabel(order.number, t("numberWaiting"))}
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
            {order.payment.status === "paid" ? t("paymentPaidCard") : `${t("paymentDueShop")} · ${formatPence(order.totalPence)}`}
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
        <p className="mt-3 font-display text-xl">{formatPence(order.totalPence)}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {next ? (
            <Button
              variant="accent"
              disabled={busy}
              onClick={() => {
                const done = guard.run(() => shop.setOrderStatus(order.id, next.status));
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
          {locked ? null : (
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

function nextStep(order: Order, t: (key: CopyKey) => string): { status: OrderStatus; label: string } | null {
  if (order.status === "new") return { status: "preparing", label: t("accept") };
  if (order.status === "preparing") return { status: "ready", label: t("markReady") };
  if (order.status === "ready") {
    const label = order.fulfilment === "delivery" ? t("delivered") : order.fulfilment === "eat_in" ? t("served") : t("collected");
    return { status: "completed", label };
  }
  return null;
}
