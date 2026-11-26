"use client";

import { useEffect, useState } from "react";
import type { CourierAction } from "@/lib/graphql-client";
import { isDanError } from "@/lib/errors";
import { messageForError, useI18n, type CopyKey } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import type { TapGuard } from "@/lib/tap-guard";
import type { Order } from "@/lib/types";
import { clock, courierActive, courierStage, finished, type CourierStage } from "@/lib/uber";
import { Button } from "./ui";

const STAGE_WORD: Record<CourierStage, CopyKey> = {
  booking: "courierBooking",
  booked: "courierBooked",
  to_shop: "courierToShop",
  with_food: "courierWithFood",
  delivered: "courierDelivered",
  cancelled: "courierCancelled",
  returned: "courierReturned",
  failed: "courierFailed",
};

/** Cancelling asks for a second tap within a few seconds, so a brush of the screen does nothing. */
function useConfirm() {
  const [armed, setArmed] = useState<CourierAction | null>(null);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(null), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);
  return { armed, arm: setArmed };
}

/**
 * Who carries a delivery, and the Uber courier: its progress, and what staff
 * may do. The Dan cloud books and cancels; these buttons only ask.
 */
export function CourierPanel({
  order,
  uberReady,
  guard,
  onError,
}: {
  order: Order;
  uberReady: boolean;
  guard: TapGuard;
  onError: (message: string | null) => void;
}) {
  const { t } = useI18n();
  const shop = useShop();
  const [busy, setBusy] = useState(false);
  const { armed, arm } = useConfirm();
  const courier = order.courier ?? null;
  /** Pressed Book: shown as booking until the cloud's answer changes the courier. */
  const courierKey = `${courier?.deliveryId ?? ""}-${courier?.status ?? ""}-${courier?.problem ?? ""}`;
  const [askedFor, setAskedFor] = useState<string | null>(null);
  const asked = askedFor === courierKey;

  if (order.fulfilment !== "delivery" && !courier?.problem) return null;
  const open = !finished(order);

  const act = (action: CourierAction, confirm = false) => {
    if (confirm && armed !== action) {
      arm(action);
      return;
    }
    arm(null);
    const done = guard.run(() => shop.courierAction(action, order.id));
    if (!done) return;
    setBusy(true);
    onError(null);
    void done
      .then(() => {
        if (action === "book") setAskedFor(courierKey);
      })
      .catch((error: unknown) => onError(messageForError(isDanError(error) ? error.code : undefined, t, error instanceof Error ? error.message : undefined)))
      .finally(() => setBusy(false));
  };

  const confirmLabel = (action: CourierAction, label: CopyKey) => (armed === action ? t("confirmTap") : t(label));
  const cardPaid = order.payment?.method === "card" && order.payment.status === "paid";

  // Both kinds of delivery are on and the customer paid online: staff choose.
  if (open && order.fulfilment === "delivery" && !order.deliveryBy && uberReady) {
    return (
      <div className="mt-3 border-t border-rule pt-2" data-testid="who-delivers">
        <p className="font-display text-sm">{t("whoDelivers")}</p>
        <div className="mt-1 flex flex-wrap gap-2">
          <Button variant="line" disabled={busy} onClick={() => act("byShop")}>
            {t("byShopDriver")}
          </Button>
          <Button variant="line" disabled={busy} onClick={() => act("byUber")}>
            {t("byUber")}
          </Button>
        </div>
      </div>
    );
  }

  if (order.deliveryBy !== "uber_direct" && !courier) return null;
  const stage = asked && !courierActive(courier) ? "booking" : courierStage(courier);
  const active = courierActive(courier);
  const problem = open && courier?.problem ? courier.problem : "";
  const eta = clock(courier?.dropoffEta ?? "");

  return (
    <div className="mt-3 border-t border-rule pt-2" data-testid="courier">
      {stage ? (
        <p className="font-display text-sm" data-testid="courier-status">
          {t(STAGE_WORD[stage])}
          {courier?.courierName && active ? ` · ${courier.courierName}` : null}
          {eta && active ? (
            <span className="text-ink-soft">
              {" "}
              · {t("courierArrives")} {eta}
            </span>
          ) : null}
          {courier?.trackingUrl && active ? (
            <a href={courier.trackingUrl} target="_blank" rel="noreferrer noopener" className="ml-2 underline underline-offset-2">
              {t("courierTrack")}
            </a>
          ) : null}
        </p>
      ) : null}
      {problem ? (
        <div className="mt-2 border-l-4 border-accent bg-accent/10 px-2 py-2" role="alert" data-testid="courier-problem">
          <p className="font-display text-sm text-accent-ink">{t("courierProblem")}</p>
          <p className="text-sm">{problem}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!active ? (
              <Button variant="accent" disabled={busy || asked} onClick={() => act("book")}>
                {t("bookAgain")}
              </Button>
            ) : null}
            {order.fulfilment === "delivery" ? (
              <Button variant="line" disabled={busy} onClick={() => act("toCollection", true)}>
                {confirmLabel("toCollection", "toCollection")}
              </Button>
            ) : null}
            <Button variant="line" disabled={busy} onClick={() => act("cancelOrder", true)}>
              {confirmLabel("cancelOrder", cardPaid ? "cancelRefund" : "cancelOrder")}
            </Button>
          </div>
        </div>
      ) : open && order.fulfilment === "delivery" ? (
        <div className="mt-1 flex flex-wrap gap-2">
          {!active && stage !== "booking" && (!courier || stage === "cancelled") ? (
            <Button variant="line" disabled={busy} onClick={() => act("book")}>
              {t("bookCourier")}
            </Button>
          ) : null}
          {active ? (
            <Button variant="line" disabled={busy} onClick={() => act("cancelCourier", true)}>
              {confirmLabel("cancelCourier", "cancelCourier")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Cancelled card orders whose refund Stripe would not make: staff refund them in Stripe. */
export function RefundFailures({ orders }: { orders: Order[] }) {
  const { t } = useI18n();
  const failed = orders.filter((order) => order.status === "cancelled" && order.refund === "failed");
  if (failed.length === 0) return null;
  return (
    <p className="mb-4 border-l-2 border-accent pl-3 text-sm" role="alert" data-testid="refund-failed">
      {t("refundFailedFor")} {failed.map((order) => (order.number > 0 ? `#${order.number}` : order.customerName)).join(", ")}
    </p>
  );
}
