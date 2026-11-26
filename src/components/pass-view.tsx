"use client";

import { TicketSounds } from "./ticket-sounds";
import { useEffect, useState } from "react";
import { isDanError } from "@/lib/errors";
import { comingTo, passOrders } from "@/lib/focus";
import { ago, orderLabel, paymentLabel, primaryName } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import { useTapGuard, type TapGuard } from "@/lib/tap-guard";
import { columnOf, DEFAULT_BOARD, nextStep } from "@/lib/board";
import { useBoardColour } from "@/lib/use-board-colour";
import { viewGloss, viewName, type View } from "@/lib/views";
import type { Order } from "@/lib/types";
import { stepLabel } from "./orders-board";
import { WhereStrip } from "./where-strip";
import { Button, PageTitle } from "./ui";

/**
 * A view with the "hand over" look (the pass): orders in the view's columns,
 * who each is for shown large, one tap to move it on.
 */
export function HandOverView({ view }: { view: View }) {
  const { t, locale } = useI18n();
  const shop = useShop();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const guard = useTapGuard();
  const focus = shop.persisted.focus;
  const locked = focus?.position === "view" && focus.view === view.id;
  const orders = shop.snapshot?.orders ?? [];
  const scope = { board: shop.snapshot?.board ?? DEFAULT_BOARD, columns: view.columns };
  const ready = passOrders(orders, scope);
  // Orders still on their way here.
  const cooking = comingTo(orders, scope);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div>
      {locked ? null : <PageTitle title={viewName(view, locale)} gloss={viewGloss(view, locale)} />}
      <TicketSounds place={view.id} />
      {view.columns.length === 0 ? (
        <p className="mb-4 border-l-2 border-accent pl-3" data-testid="view-no-columns">
          {t("viewNoColumns")}
        </p>
      ) : null}
      <p className="font-display text-lg text-ink-soft" data-testid="pass-cooking">
        {cooking} {t("passPreparing")}
      </p>
      {error ? (
        <p className="mt-3 border-l-2 border-accent pl-3" role="alert">
          {error}
        </p>
      ) : null}
      {ready.length === 0 ? <p className="mt-8 font-display text-2xl text-ink-soft">{t("passEmpty")}</p> : null}
      <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] items-start gap-5">
        {ready.map((order) => (
          <PassCard key={order.id} order={order} now={now} guard={guard} onError={setError} />
        ))}
      </div>
    </div>
  );
}

function PassCard({ order, now, guard, onError }: { order: Order; now: number; guard: TapGuard; onError: (message: string | null) => void }) {
  const { t, locale } = useI18n();
  const shop = useShop();
  const [busy, setBusy] = useState(false);
  const board = shop.snapshot?.board ?? DEFAULT_BOARD;
  const column = columnOf(board, order);
  const shown = useBoardColour();
  const step = nextStep(board, order);
  const done = step ? stepLabel(step, order, t, locale) : t("collected");
  const payment = paymentLabel(order, t);
  const due = payment ? !payment.paid : false;
  return (
    <article className="glow bg-paper-raised p-4" style={{ "--glow": shown(column?.colour ?? "#d7372a") } as React.CSSProperties} data-testid="pass-ticket" data-column={column?.id}>
      <WhereStrip order={order} size="pass" />
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-4xl leading-none">{orderLabel(order.number, t("numberWaiting"))}</h3>
        <span className="text-sm text-ink-soft">{ago(order.createdAt, now, locale, t("justNow"))}</span>
      </div>
      {due ? (
        <p className="mt-2 inline-block border-2 border-accent px-2 py-1 font-display text-lg text-accent-ink" data-testid="pass-due">
          {payment?.text}
        </p>
      ) : null}
      <ul className="mt-3 space-y-0.5 text-lg">
        {order.lines.map((line) => (
          <li key={`${line.number}-${line.nameEn}`}>
            {line.qty}× {primaryName(line.nameEn, line.nameZh, locale)}
          </li>
        ))}
      </ul>
      {order.notes ? <p className="mt-2 border-l-4 border-accent pl-2">{order.notes}</p> : null}
      <Button
        variant="ink"
        className="mt-4 min-h-14 w-full text-2xl"
        disabled={busy}
        onClick={() => {
          const done = guard.run(() => shop.advanceOrder(order));
          if (!done) return;
          setBusy(true);
          onError(null);
          void done
            .catch((error: unknown) => onError(isDanError(error) ? error.message : t("errGeneric")))
            .finally(() => setBusy(false));
        }}
      >
        {done}
      </Button>
    </article>
  );
}
