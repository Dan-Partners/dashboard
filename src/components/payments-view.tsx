"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { connectPayments, getPayments, type PaymentsStatus } from "@/lib/payments";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { Button, PageTitle } from "./ui";

/**
 * The owner connects the shop's Stripe account, so customers can pay by card
 * on the shop's ordering site. Money goes straight to the shop's account.
 */
export function PaymentsView() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const session = shop.persisted.session;
  const cloudUrl = session?.cloudUrl ?? null;
  const cloudToken = session?.cloudToken ?? null;
  const [status, setStatus] = useState<PaymentsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOwner || !cloudUrl || !cloudToken) return;
    let cancelled = false;
    getPayments(cloudUrl, cloudToken)
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setError(t("paymentsCloudDown"));
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, cloudUrl, cloudToken, t]);

  async function connect() {
    if (!cloudUrl || !cloudToken) return;
    setBusy(true);
    setError(null);
    try {
      const url = await connectPayments(cloudUrl, cloudToken, `${window.location.origin}/shop/payments`);
      window.location.assign(url);
    } catch {
      setError(t("paymentsCloudDown"));
      setBusy(false);
    }
  }

  let body: React.ReactNode;
  if (!isOwner) {
    body = <p className="text-ink-soft">{t("paymentsOwnerOnly")}</p>;
  } else if (!cloudUrl) {
    body = <p className="text-ink-soft">{t("paymentsNeedCloud")}</p>;
  } else if (!cloudToken) {
    body = <p className="text-ink-soft">{t("paymentsSignInAgain")}</p>;
  } else if (!status) {
    body = error ? null : <p className="text-ink-soft">{t("paymentsChecking")}</p>;
  } else if (!status.available) {
    body = <p className="text-ink-soft">{t("paymentsNotAvailable")}</p>;
  } else if (status.cardPayments) {
    body = (
      <p className="border-l-[6px] border-accent bg-paper-raised px-4 py-3" data-testid="payments-on">
        {t("paymentsOn")}
      </p>
    );
  } else {
    body = (
      <div className="space-y-4">
        <p className="max-w-xl">{status.connected ? t("paymentsFinish") : t("paymentsIntro")}</p>
        <Button variant="accent" disabled={busy} onClick={() => void connect()} data-testid="payments-connect">
          {status.connected ? t("paymentsFinishButton") : t("paymentsConnect")}
        </Button>
        <p className="max-w-xl text-sm text-ink-soft">{t("paymentsHow")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <PageTitle title={t("paymentsTitle")} gloss={locale === "zh-Hant" ? "Payments" : "收款"} />
      <div className="mt-6 space-y-4">
        {body}
        {error ? (
          <p className="border-l-2 border-accent pl-3 text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
