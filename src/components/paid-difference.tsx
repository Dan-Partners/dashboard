"use client";

import { formatPence } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { paidDifference } from "@/lib/order-edit";
import type { Order } from "@/lib/types";

/** For an order already paid whose bill a change has moved: what was taken, the bill now, and the difference. */
export function PaidDifference({ order, className = "" }: { order: Pick<Order, "paidPence" | "totalPence" | "payment">; className?: string }) {
  const { t } = useI18n();
  const difference = paidDifference(order);
  if (!difference) return null;
  const took = order.payment?.method === "card" ? "paidTookCard" : order.payment?.method === "bank_transfer" ? "paidTookBank" : "paidTook";
  return (
    <p className={`border-l-4 border-accent bg-accent/10 px-2 py-1 text-sm leading-snug ${className}`} data-testid="paid-difference">
      {t(took)} {formatPence(difference.paidPence)}. {t("paidBillNow")} {formatPence(order.totalPence)}.{" "}
      <strong className="font-display">
        {formatPence(Math.abs(difference.differencePence))} {t(difference.differencePence > 0 ? "paidToCollect" : "paidToRefund")}
      </strong>
      .
    </p>
  );
}
