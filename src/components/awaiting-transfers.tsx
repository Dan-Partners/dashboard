"use client";

import { useCallback, useEffect, useState } from "react";
import { formatClock, formatPence, fulfilmentLabel } from "@/lib/format";
import { GraphQLDanClient } from "@/lib/graphql-client";
import { useI18n } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import { useTapGuard } from "@/lib/tap-guard";
import type { AwaitingPayment } from "@/lib/types";

const CHECK_EVERY_MS = 10_000;

/**
 * Bank transfers waiting for staff to see the money arrive. They are held in
 * the Dan cloud, where customers' orders are taken, so the list comes from
 * there. Paid sends the order to the board; Not received tells the customer.
 */
export function AwaitingTransfers() {
  const { t } = useI18n();
  const shop = useShop();
  const guard = useTapGuard();
  const session = shop.persisted.session;
  const on = shop.snapshot?.ordering.settings.bankTransfer ?? false;
  const cloudUrl = session?.mode === "remote" ? session.cloudUrl : null;
  const cloudToken = session?.mode === "remote" ? session.cloudToken : null;
  const [list, setList] = useState<AwaitingPayment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cloudUrl || !cloudToken) return;
    try {
      setList(await new GraphQLDanClient(cloudUrl, cloudToken).getAwaitingPayments());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("errGeneric"));
    }
  }, [cloudUrl, cloudToken, t]);

  useEffect(() => {
    if (!on || !cloudUrl || !cloudToken) return;
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void load();
    };
    tick();
    const timer = window.setInterval(tick, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [on, cloudUrl, cloudToken, load]);

  if (!on || session?.mode !== "remote") return null;
  if (!cloudUrl || !cloudToken) {
    return (
      <p className="mb-5 border-l-2 border-accent pl-3 text-sm" data-testid="awaiting-no-cloud">
        {t("awaitingNoCloud")}
      </p>
    );
  }
  if (list.length === 0 && !error) return null;

  const act = (id: string, work: (client: GraphQLDanClient) => Promise<void>) => {
    const done = guard.run(() => work(new GraphQLDanClient(cloudUrl, cloudToken)));
    if (!done) return;
    void done
      .then(async () => {
        setList((current) => current.filter((entry) => entry.id !== id));
        await shop.retryRemote().catch(() => undefined);
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : t("errGeneric")));
  };

  return (
    <section className="mb-6 border border-rule border-l-[6px] border-l-[#c98a1b] bg-paper-raised p-4" aria-labelledby="awaiting-title" data-testid="awaiting-transfers">
      <h2 id="awaiting-title" className="font-display text-xl">
        {t("awaitingTitle")} <span className="text-ink-soft">({list.length})</span>
      </h2>
      <p className="mt-1 text-sm text-ink-soft">{t("awaitingHint")}</p>
      {error ? (
        <p className="mt-2 text-sm text-accent-ink" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="mt-3 divide-y divide-rule">
        {list.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3" data-testid="awaiting-transfer">
            <div className="min-w-0 flex-1">
              <p className="font-display text-2xl tracking-[0.06em]" data-testid="awaiting-reference">
                {entry.reference}
              </p>
              <p>
                <span className="font-display">{formatPence(entry.totalPence)}</span> · {entry.customerName} · {entry.phone}
              </p>
              <p className="text-sm text-ink-soft">
                {fulfilmentLabel(entry, t)} · {entry.lines.map((line) => `${line.qty}× ${line.nameEn}`).join(", ")} · {t("awaitingLapses")}{" "}
                {formatClock(new Date(entry.expiresAt))}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="min-h-11 cursor-pointer bg-accent px-5 font-display text-on-accent active:bg-accent-deep"
                onClick={() => act(entry.id, (client) => client.markBankTransferPaid(entry.id))}
              >
                {t("awaitingPaid")}
              </button>
              <button
                type="button"
                className="min-h-11 cursor-pointer border border-rule px-4 font-display active:bg-paper-deep"
                onClick={() => act(entry.id, (client) => client.rejectBankTransfer(entry.id))}
              >
                {t("awaitingReject")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
