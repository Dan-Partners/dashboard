"use client";

import { useEffect, useState } from "react";
import { isDanError } from "@/lib/errors";
import { passOrders } from "@/lib/focus";
import { ago, formatPence, orderLabel, primaryName } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import { useTapGuard, type TapGuard } from "@/lib/tap-guard";
import type { Order } from "@/lib/types";
import { WhereStrip } from "./where-strip";
import { Button, PageTitle } from "./ui";

/** The pass: orders ready to hand over, the table number large, one tap to finish. */
export function PassView() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const guard = useTapGuard();
  const locked = shop.persisted.focus?.position === "pass";
  const orders = shop.snapshot?.orders ?? [];
  const ready = passOrders(orders);
  const cooking = orders.filter((order) => order.status === "new" || order.status === "preparing").length;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div>
      {locked ? null : <PageTitle title={t("passTitle")} gloss={locale === "zh-Hant" ? "Pass" : "出餐"} />}
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
  const done = order.fulfilment === "delivery" ? t("delivered") : order.fulfilment === "eat_in" ? t("served") : t("collected");
  const due = order.payment?.status === "due";
  return (
    <article className="glow glow-ready bg-paper-raised p-4" data-testid="pass-ticket">
      <WhereStrip order={order} size="pass" />
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-4xl leading-none">{orderLabel(order.number, t("numberWaiting"))}</h3>
        <span className="text-sm text-ink-soft">{ago(order.createdAt, now, locale, t("justNow"))}</span>
      </div>
      {due ? (
        <p className="mt-2 inline-block border-2 border-accent px-2 py-1 font-display text-lg text-accent-ink" data-testid="pass-due">
          {t("paymentDueShop")} · {formatPence(order.totalPence)}
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
          const done = guard.run(() => shop.setOrderStatus(order.id, "completed"));
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
