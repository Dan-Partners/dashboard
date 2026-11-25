"use client";

import { fulfilmentLabel } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Order } from "@/lib/types";

/**
 * The top of a ticket at the pass or on the board: where the food goes, big.
 * An eat-in order with a table repeats the table number in large type.
 */
export function WhereStrip({ order, size }: { order: Order; size: "pass" | "board" }) {
  const { t } = useI18n();
  const big = size === "pass";
  if (order.fulfilment === "eat_in" && order.table) {
    return (
      <div className="flex items-baseline gap-3 border-b border-rule pb-2" data-testid="where-strip">
        <span className={`font-display tracking-[0.14em] text-ink-soft uppercase ${big ? "text-xl" : "text-sm"}`}>{t("table")}</span>
        <span className={`font-display leading-none ${big ? "text-7xl" : "text-4xl"}`} data-testid="where-table">
          {order.table}
        </span>
      </div>
    );
  }
  return (
    <div className="border-b border-rule pb-2" data-testid="where-strip">
      <p className={`font-display leading-none uppercase ${big ? "text-4xl tracking-[0.08em]" : "text-2xl tracking-[0.06em]"}`}>
        {fulfilmentLabel(order, t)}
      </p>
      {order.customerName ? <p className={`mt-1 ${big ? "text-2xl" : "text-lg"}`}>{order.customerName}</p> : null}
    </div>
  );
}
