"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n, type CopyKey } from "@/lib/i18n";
import { isDanError } from "@/lib/errors";
import { formatPence } from "@/lib/format";
import { acceptTerms, connectPayments, getPayments, percentText, sameDeal, type Deal, type PaymentsStatus } from "@/lib/payments";
import { settingsRoute } from "@/lib/settings";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { Button } from "./ui";

/** Where Stripe sends the owner back after connecting. The cloud checks only its origin. */
export const STRIPE_RETURN = `${settingsRoute("integrations")}/stripe`;

/**
 * The shop's card payments as the Dan cloud sees them (owner only, signed in
 * to the cloud). `why` says why there is no status: no cloud, not signed in
 * to it, or it could not be reached.
 */
export function usePaymentsStatus() {
  const { t } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const session = shop.persisted.session;
  const cloudUrl = session?.cloudUrl ?? null;
  const cloudToken = session?.cloudToken ?? null;
  const [status, setStatus] = useState<PaymentsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const why: CopyKey | null = !isOwner ? "paymentsOwnerOnly" : !cloudUrl ? "paymentsNeedCloud" : !cloudToken ? "paymentsSignInAgain" : null;
  return { status, setStatus, error, setError, why, cloudUrl, cloudToken };
}

/**
 * Integrations, Stripe: the owner connects the shop's own Stripe account, so
 * customers can pay by card on the ordering site. Money goes straight to the
 * shop's account; Stripe pays it out to the shop's bank. Dan's terms are
 * accepted under Subscription.
 */
export function StripeIntegration() {
  const { t } = useI18n();
  const { status, error, setError, why, cloudUrl, cloudToken } = usePaymentsStatus();
  const [busy, setBusy] = useState(false);

  async function connect() {
    if (!cloudUrl || !cloudToken) return;
    setBusy(true);
    setError(null);
    try {
      const url = await connectPayments(cloudUrl, cloudToken, `${window.location.origin}${STRIPE_RETURN}`);
      window.location.assign(url);
    } catch {
      setError(t("paymentsCloudDown"));
      setBusy(false);
    }
  }

  let body: React.ReactNode;
  if (why) {
    body = <p className="text-ink-soft">{t(why)}</p>;
  } else if (!status) {
    body = error ? null : <p className="text-ink-soft">{t("paymentsChecking")}</p>;
  } else if (!status.available) {
    body = <p className="text-ink-soft">{t("paymentsNotAvailable")}</p>;
  } else if (status.accountReady || status.cardPayments) {
    const held = status.payoutsEnabled === false;
    body = (
      <>
        <dl className="divide-y divide-rule border-y border-rule" data-testid="stripe-state">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
            <dt className="font-display text-lg">{t("stripeCardPayments")}</dt>
            <dd data-testid="stripe-cards">
              {status.cardPayments ? (
                t("stripeOn")
              ) : (
                <Link href={settingsRoute("subscription")} className="text-accent-ink underline">
                  {t("stripeAcceptTerms")}
                </Link>
              )}
            </dd>
          </div>
          {status.payoutsEnabled !== undefined ? (
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
              <dt className="font-display text-lg">{t("stripePayouts")}</dt>
              <dd className={held ? "text-accent-ink" : undefined} data-testid="stripe-payouts">
                {held ? t("stripePayoutsHeld") : t("stripeOn")}
              </dd>
            </div>
          ) : null}
        </dl>
        {status.cardPayments ? (
          <p className="border-l-[6px] border-accent bg-paper-raised px-4 py-3" data-testid="payments-on">
            {t("paymentsOn")}
          </p>
        ) : null}
        <p className="max-w-xl">{t("stripeBankLine")}</p>
        {/* The owner's own Stripe account: Dan has no say in it and no way into it. */}
        <a href="https://dashboard.stripe.com/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-display text-accent-ink underline" data-testid="stripe-dashboard">
          {t("stripeOpen")} ↗
        </a>
      </>
    );
  } else {
    body = (
      <div className="space-y-4">
        <p className="max-w-xl">{status.connected ? t("paymentsFinish") : t("paymentsIntro")}</p>
        <Button variant="accent" disabled={busy} onClick={() => void connect()} data-testid="payments-connect">
          {status.connected ? t("paymentsFinishButton") : t("paymentsConnect")}
        </Button>
        <p className="max-w-xl text-sm text-ink-soft">{t("paymentsHow")}</p>
        <p className="max-w-xl text-sm text-ink-soft">{t("stripeBankLine")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4" data-testid="stripe-integration">
      {body}
      {error ? (
        <p className="border-l-2 border-accent pl-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Subscription: what the shop has agreed with Dan. Today that is the deal on
 * card payments and Dan's terms; Dan charges nothing else (RK, 27 Nov 2026).
 */
export function SubscriptionView() {
  const { t } = useI18n();
  const { status, setStatus, error, why, cloudUrl, cloudToken } = usePaymentsStatus();
  return (
    <div className="max-w-2xl space-y-4" data-testid="subscription">
      {why ? (
        <p className="text-ink-soft">{t(why === "paymentsOwnerOnly" ? "settingsOwnerOnly" : why)}</p>
      ) : !status ? (
        error ? null : <p className="text-ink-soft">{t("paymentsChecking")}</p>
      ) : (
        <>
          {status.accountReady && !status.cardPayments ? (
            <p className="border-l-[6px] border-accent bg-paper-raised px-4 py-3" data-testid="payments-waiting-terms">
              {t("dealCardsWait")}
            </p>
          ) : null}
          {cloudUrl && cloudToken ? <DealSection status={status} onAccepted={setStatus} cloudUrl={cloudUrl} cloudToken={cloudToken} /> : null}
        </>
      )}
      <p className="font-display text-lg" data-testid="nothing-else">
        {t("subscriptionNothingElse")}
      </p>
      {error ? (
        <p className="border-l-2 border-accent pl-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function dealWords(deal: Deal, t: (key: CopyKey) => string): string {
  return t("dealWords")
    .replace("{free}", String(deal.freeCardOrders))
    .replace("{percent}", percentText(deal.percentBp))
    .replace("{cap}", formatPence(deal.capPence));
}

/**
 * Dan's deal with the shop and Dan's terms: what the owner agrees to before
 * customers can pay by card. A new deal or terms are shown here; until the
 * owner accepts, the deal they last accepted applies.
 */
function DealSection({
  status,
  onAccepted,
  cloudUrl,
  cloudToken,
}: {
  status: PaymentsStatus;
  onAccepted: (next: PaymentsStatus) => void;
  cloudUrl: string;
  cloudToken: string;
}) {
  const { t, locale } = useI18n();
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const deal = status.deal;
  if (!deal || !status.terms) return null;
  const used = Math.min(status.cardOrdersPaid ?? 0, deal.freeCardOrders);
  const accepted = status.agreement;
  const terms = status.terms;

  const accept = () => {
    if (!name.trim() || !agreed) {
      setMessage(t("dealNeedNameAndTick"));
      return;
    }
    setBusy(true);
    setMessage(null);
    acceptTerms(cloudUrl, cloudToken, terms.version, deal, name)
      .then((next) => {
        onAccepted(next);
        setName("");
        setAgreed(false);
      })
      .catch((error: unknown) => setMessage(isDanError(error) && error.code === "agreement_changed" ? t("dealChanged") : t("paymentsCloudDown")))
      .finally(() => setBusy(false));
  };

  return (
    <section className="space-y-4" aria-labelledby="deal-title" data-testid="deal">
      <h2 id="deal-title" className="font-display text-2xl">
        {t("dealTitle")}
      </h2>
      <p data-testid="deal-words">{dealWords(deal, t)}</p>
      <p className="text-sm text-ink-soft">{t("dealNoFee")}</p>
      <p className="font-display text-lg" data-testid="deal-usage">
        {t("dealUsage").replace("{used}", String(used)).replace("{free}", String(deal.freeCardOrders))}
      </p>
      {accepted ? (
        <p className="text-sm text-ink-soft" data-testid="deal-accepted">
          {t("dealAcceptedBy")} {accepted.ownerName} ({accepted.ownerEmail}), {new Date(accepted.acceptedAt).toLocaleDateString(locale === "zh-Hant" ? "zh-HK" : "en-GB", { timeZone: "Europe/London" })} · {t("dealTermsVersion")} {accepted.termsVersion}
        </p>
      ) : null}
      {status.needsAcceptance ? (
        <div className="space-y-3 border-l-4 border-accent bg-accent/10 p-3" data-testid="deal-accept">
          <p className="font-display">{accepted ? t("dealNewToAccept") : t("dealAcceptToStart")}</p>
          {accepted && !sameDeal(accepted.deal, deal) ? (
            <p className="text-sm" data-testid="deal-until">
              {t("dealUntil")} {dealWords(accepted.deal, t)}
            </p>
          ) : null}
          <p className="text-sm text-ink-soft">
            {t("dealTermsVersion")} {terms.version}
          </p>
          <div className="max-h-80 overflow-y-auto border border-rule bg-paper-raised p-3 text-sm leading-relaxed whitespace-pre-line" tabIndex={0} data-testid="terms-text" aria-label={t("dealTermsTitle")}>
            {terms.text}
          </div>
          <label className="block">
            <span className="font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("dealYourName")}</span>
            <input className="mt-1 min-h-12 w-full max-w-sm border border-rule bg-paper-raised px-3 text-lg" value={name} maxLength={80} autoComplete="name" onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1 size-5" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} data-testid="deal-agree" />
            <span>{t("dealAgree")}</span>
          </label>
          <Button variant="accent" className="min-h-12 px-6" disabled={busy} onClick={accept} data-testid="deal-accept-button">
            {t("dealAccept")}
          </Button>
          {message ? (
            <p className="border-l-2 border-accent pl-3 text-sm" role="alert">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
