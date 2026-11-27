"use client";

import { formatPence } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { refundState } from "@/lib/order-edit";
import type { Order } from "@/lib/types";

/**
 * For a cancelled order that was paid online: the card refunded, the refund
 * on its way, the refund failed (the owner does it in Stripe), or a bank
 * transfer the owner sends back themselves.
 */
export function RefundNote({ order, className = "" }: { order: Pick<Order, "status" | "payment" | "paidPence" | "totalPence" | "refund">; className?: string }) {
  const { t } = useI18n();
  const refund = refundState(order);
  if (!refund) return null;
  const amount = formatPence(refund.pence);
  const urgent = refund.state === "failed" || refund.state === "bank";
  return (
    <p
      className={`border-l-4 px-2 py-1 text-sm leading-snug ${urgent ? "border-accent bg-accent/10" : "border-rule"} ${className}`}
      role={refund.state === "failed" ? "alert" : undefined}
      data-testid="refund-note"
      data-refund={refund.state}
    >
      {refund.state === "refunded" ? (
        <>
          <strong className="font-display">{amount}</strong> {t("refundDone")}
        </>
      ) : refund.state === "pending" ? (
        <>
          <strong className="font-display">{amount}</strong> {t("refundPending")}
        </>
      ) : (
        <>
          {t(refund.state === "failed" ? "refundFailedOne" : "refundBank")} <strong className="font-display">{amount}</strong>.
        </>
      )}
    </p>
  );
}
