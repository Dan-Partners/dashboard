"use client";

import { useEffect, useState } from "react";
import { useI18n, type CopyKey } from "@/lib/i18n";
import { isDanError } from "@/lib/errors";
import { formatPence } from "@/lib/format";
import { acceptTerms, connectPayments, getPayments, percentText, sameDeal, type Deal, type PaymentsStatus } from "@/lib/payments";
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
  } else if (status.cardPayments || status.accountReady) {
    body = (
      <>
        {status.cardPayments ? (
          <p className="border-l-[6px] border-accent bg-paper-raised px-4 py-3" data-testid="payments-on">
            {t("paymentsOn")}
          </p>
        ) : (
          <p className="border-l-[6px] border-accent bg-paper-raised px-4 py-3" data-testid="payments-waiting-terms">
            {t("dealCardsWait")}
          </p>
        )}
        <DealSection status={status} onAccepted={setStatus} cloudUrl={cloudUrl} cloudToken={cloudToken} />
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
        <DealSection status={status} onAccepted={setStatus} cloudUrl={cloudUrl} cloudToken={cloudToken} />
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
    <section className="mt-8 space-y-4" aria-labelledby="deal-title" data-testid="deal">
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
