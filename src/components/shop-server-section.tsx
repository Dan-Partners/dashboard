"use client";

import { useEffect, useState } from "react";
import { isDanError } from "@/lib/errors";
import { formatPence } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { buyShopServer, getShopServer, manageShopServer, type ShopServerStatus } from "@/lib/payments";
import { settingsRoute } from "@/lib/settings";
import { Button } from "./ui";

/** "27 December 2026", in the shop's time. */
function day(iso: string | null, locale: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat(locale === "zh-Hant" ? "zh-HK" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(new Date(iso));
}

/**
 * Settings, Subscription: the shop server, bought by the owner (RK, 27 Nov
 * 2026, DAN-35). The prices are Stripe's, through the cloud. Paying goes
 * through Stripe Checkout on Dan's own account; Dan switches it on once the
 * machine is set up. Card and cancelling are on Stripe's own billing page.
 */
export function ShopServerSection({
  cloudUrl,
  cloudToken,
  refreshKey,
  onStatus,
}: {
  cloudUrl: string;
  cloudToken: string;
  /** Changes when the owner accepts Dan's terms, so buying becomes possible. */
  refreshKey: string | null;
  onStatus: (status: ShopServerStatus | null) => void;
}) {
  const { t, locale } = useI18n();
  const [status, setStatus] = useState<ShopServerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Back from Stripe: ?shopServer=paid or cancelled.
  const [back] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("shopServer")));

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let tries = 0;
    const load = () =>
      getShopServer(cloudUrl, cloudToken)
        .then((next) => {
          if (cancelled) return;
          setStatus(next);
          onStatus(next);
          // Stripe's notice can arrive a moment after the owner is back: look again for a while.
          if (back === "paid" && next.state === "none" && tries++ < 10) timer = window.setTimeout(load, 2000);
        })
        .catch(() => {
          if (!cancelled) onStatus(null);
        });
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cloudUrl, cloudToken, refreshKey, back, onStatus]);

  if (!status) return null;
  const { prices } = status;
  const bought = status.state === "paid" || status.state === "payment_failed" || status.state === "cancelling";
  // Nothing to show: not offered here, and nothing bought or on.
  if (!status.available && !bought && !status.on && status.state !== "ended") return null;

  const returnTo = `${window.location.origin}${settingsRoute("subscription")}`;
  const go = (open: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    open()
      .then((url) => window.location.assign(url))
      .catch((error: unknown) => {
        setBusy(false);
        const code = isDanError(error) ? error.code : "";
        setMessage(t(code === "terms_needed" ? "shopServerTermsFirst" : code === "already_bought" ? "shopServerPaid" : "paymentsCloudDown"));
      });
  };
  const price = prices
    ? t("shopServerPrice")
        .replace("{setup}", formatPence(prices.setupPence))
        .replace("{was}", prices.setupWasPence ? t("shopServerWas").replace("{was}", formatPence(prices.setupWasPence)) : "")
        .replace("{monthly}", formatPence(prices.monthlyPence))
    : null;
  const line = (() => {
    if (status.ownMachine) return t("shopServerOwnMachine");
    if (status.withoutPayment && status.on) return t("shopServerFree");
    switch (status.state) {
      case "paid":
        return status.on ? t("shopServerOn") : t("shopServerPaid");
      case "payment_failed":
        return t("shopServerFailed");
      case "cancelling":
        return t("shopServerCancelling").replace("{date}", day(status.endsAt, locale));
      case "ended":
        return t("shopServerEnded").replace("{date}", day(status.endedAt, locale));
      default:
        return back === "paid" ? t("shopServerConfirming") : back === "cancelled" ? t("shopServerCheckoutCancelled") : null;
    }
  })();
  const canBuy = status.available && !bought && !status.on && !status.ownMachine;

  return (
    <section aria-labelledby="shop-server-title" className="border-t border-rule pt-6" data-testid="shop-server" data-state={status.state} data-on={status.on}>
      <h2 id="shop-server-title" className="font-display text-2xl">
        {t("shopServerTitle")}
      </h2>
      <p className="mt-1 text-ink-soft">{t("shopServerWhat")}</p>
      {price ? (
        <p className="mt-3 font-display text-lg" data-testid="shop-server-price">
          {price}
        </p>
      ) : null}
      {line ? (
        <p
          className={`mt-3 ${status.state === "payment_failed" ? "border-l-[6px] border-accent bg-paper-raised px-4 py-3" : ""}`}
          role={status.state === "payment_failed" ? "alert" : "status"}
          data-testid="shop-server-state"
        >
          {line}
          {status.state === "paid" && status.on && status.periodEnd ? ` ${t("shopServerNext").replace("{date}", day(status.periodEnd, locale))}` : ""}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {canBuy ? (
          <Button type="button" variant="accent" disabled={busy || !status.termsAccepted} onClick={() => go(() => buyShopServer(cloudUrl, cloudToken, returnTo))} data-testid="shop-server-buy">
            {t("shopServerBuy")}
          </Button>
        ) : null}
        {bought || status.state === "ended" ? (
          <Button type="button" variant="line" disabled={busy} onClick={() => go(() => manageShopServer(cloudUrl, cloudToken, returnTo))} data-testid="shop-server-manage">
            {t("shopServerManage")}
          </Button>
        ) : null}
      </div>
      {canBuy && !status.termsAccepted ? (
        <p className="mt-2 text-sm text-ink-soft" data-testid="shop-server-terms-first">
          {t("shopServerTermsFirst")}
        </p>
      ) : null}
      {message ? (
        <p className="mt-2 border-l-2 border-accent pl-3 text-sm" role="alert">
          {message}
        </p>
      ) : null}
    </section>
  );
}
