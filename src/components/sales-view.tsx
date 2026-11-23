"use client";

import { useEffect, useState } from "react";
import { formatPence, primaryName, secondaryName } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import type { SalesRange, SalesSummary } from "@/lib/types";
import { PageTitle } from "./ui";

export function SalesView() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const [range, setRange] = useState<SalesRange>("today");
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orderCount = shop.snapshot?.orders.length ?? 0;
  const loadSales = shop.loadSales;

  useEffect(() => {
    let cancelled = false;
    loadSales(range)
      .then((next) => {
        if (!cancelled) setSummary(next);
      })
      .catch(() => {
        if (!cancelled) setError("generic");
      });
    return () => {
      cancelled = true;
    };
  }, [range, orderCount, loadSales]);

  const maxQty = summary?.topItems[0]?.qty ?? 1;

  return (
    <div>
      <PageTitle title={t("salesTitle")} gloss={locale === "zh-Hant" ? "Sales" : "營業"} />
      <div className="flex gap-2">
        <RangeButton pressed={range === "today"} label={t("salesToday")} onClick={() => setRange("today")} />
        <RangeButton pressed={range === "week"} label={t("salesWeek")} onClick={() => setRange("week")} />
      </div>
      {error ? <p className="mt-4 text-accent-ink">{t("errGeneric")}</p> : null}
      {summary && summary.orderCount === 0 ? <p className="mt-8 text-ink-soft">{t("salesEmpty")}</p> : null}
      {summary && summary.orderCount > 0 ? (
        <>
          <dl className="mt-8 grid gap-6 sm:grid-cols-3">
            <Stat label={t("salesTakings")} value={formatPence(summary.totalPence)} />
            <Stat label={t("salesOrders")} value={String(summary.orderCount)} note={`${summary.openCount} ${t("salesOpen")}`} />
            <Stat label={t("salesAverage")} value={formatPence(summary.averagePence)} />
          </dl>
          <section className="mt-10 max-w-xl">
            <h2 className="font-display text-2xl">{t("salesSplit")}</h2>
            <div className="mt-3 flex h-3 overflow-hidden border border-rule" aria-hidden>
              <span className="bg-ink" style={{ width: `${(summary.collectionCount / summary.orderCount) * 100}%` }} />
              <span className="bg-accent" style={{ width: `${(summary.deliveryCount / summary.orderCount) * 100}%` }} />
            </div>
            <p className="mt-2 text-sm">
              {t("fulfilCollection")} {summary.collectionCount}
              <span className="mx-3 text-rule">|</span>
              {t("fulfilDelivery")} {summary.deliveryCount}
            </p>
          </section>
          <section className="mt-10 max-w-xl">
            <h2 className="font-display text-2xl">{t("salesTop")}</h2>
            <ol className="mt-3 divide-y divide-rule border-y border-rule">
              {summary.topItems.map((item) => (
                <li key={item.number} className="py-3">
                  <div className="flex items-baseline gap-3">
                    <span className="w-10 font-display text-accent-ink">{item.number}</span>
                    <span className="min-w-0 flex-1">
                      {primaryName(item.nameEn, item.nameZh, locale)}
                      <span className="ml-2 font-zh text-sm text-ink-soft">{secondaryName(item.nameEn, item.nameZh, locale)}</span>
                    </span>
                    <span className="font-display">×{item.qty}</span>
                  </div>
                  <div className="mt-2 ml-[3.25rem]">
                    <div className="h-0.5 bg-accent" style={{ width: `${Math.max(8, (item.qty / maxQty) * 100)}%` }} />
                  </div>
                  <p className="mt-1 ml-[3.25rem] text-sm text-ink-soft">{formatPence(item.totalPence)}</p>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-t border-rule pt-3">
      <dt className="font-display text-[0.72rem] tracking-[0.16em] uppercase text-ink-soft">{label}</dt>
      <dd className="mt-2 font-display text-4xl leading-none">{value}</dd>
      {note ? <p className="mt-2 text-sm text-ink-soft">{note}</p> : null}
    </div>
  );
}

function RangeButton({ pressed, label, onClick }: { pressed: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`min-h-11 cursor-pointer border px-4 font-display ${pressed ? "border-ink bg-ink text-paper" : "border-rule"}`}
    >
      {label}
    </button>
  );
}
