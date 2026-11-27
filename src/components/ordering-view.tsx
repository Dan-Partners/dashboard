"use client";

import { useState } from "react";
import { isDanError } from "@/lib/errors";
import { parsePoundsToPence } from "@/lib/format";
import { messageForError, useI18n, type CopyKey } from "@/lib/i18n";
import { bankIsEmpty, checkedBank, checkOrdering, DEFAULT_SETUP, sortCodeDisplay, type BankDetails, type OrderingSettings } from "@/lib/ordering";
import { useIsOwner, useShop } from "@/lib/shop-context";
import Link from "next/link";
import { settingsRoute } from "@/lib/settings";
import { Button, TextField } from "./ui";
import { usePaymentsStatus } from "./payments-view";

type Flag = Exclude<keyof OrderingSettings, "deliveryFeePence" | "deliveryMinimumPence">;

const ORDER_ROWS: { key: Flag; label: CopyKey; hint: CopyKey }[] = [
  { key: "till", label: "methodTill", hint: "methodTillHint" },
  { key: "table", label: "methodTable", hint: "methodTableHint" },
  { key: "collection", label: "methodCollection", hint: "methodCollectionHint" },
  { key: "delivery", label: "methodDelivery", hint: "methodDeliveryHint" },
  { key: "uberDirect", label: "methodUber", hint: "methodUberHint" },
];

const PAY_ROWS: { key: Flag; label: CopyKey; hint: CopyKey }[] = [
  { key: "payInPerson", label: "payInPerson", hint: "payInPersonHint" },
  { key: "stripe", label: "payStripe", hint: "payStripeHint" },
  { key: "bankTransfer", label: "payBank", hint: "payBankHint" },
];

const EMPTY_BANK: BankDetails = { accountName: "", sortCode: "", accountNumber: "", referencePrefix: "" };
const pounds = (pence: number | null) => (pence === null ? "" : (pence / 100).toFixed(2));

/**
 * The owner chooses how the shop takes orders and payment. The counter PIN
 * sees the same screen, read-only, as with the theme.
 */
export function OrderingView() {
  const { t } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const setup = shop.snapshot?.ordering ?? DEFAULT_SETUP;
  const [settings, setSettings] = useState<OrderingSettings>(setup.settings);
  const [fee, setFee] = useState(pounds(setup.settings.deliveryFeePence));
  const [minimum, setMinimum] = useState(pounds(setup.settings.deliveryMinimumPence));
  const [bank, setBank] = useState<BankDetails>(setup.bank ? { ...setup.bank, sortCode: sortCodeDisplay(setup.bank.sortCode) } : EMPTY_BANK);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (key: Flag) => setSettings((current) => ({ ...current, [key]: !current[key] }));
  const delivering = settings.delivery;
  const showBank = settings.bankTransfer || !bankIsEmpty(setup.bank);

  const save = () => {
    setMessage(null);
    const money = (text: string) => (text.trim() === "" ? null : parsePoundsToPence(text));
    const next: OrderingSettings = { ...settings, deliveryFeePence: money(fee), deliveryMinimumPence: money(minimum) };
    try {
      const bankNext = bankIsEmpty(bank) ? null : checkedBank(bank);
      checkOrdering(next, bankNext, setup.uberReady);
      setBusy(true);
      void shop
        .saveOrdering(next, bankNext ?? EMPTY_BANK)
        .then(() => setMessage({ text: t("orderingSaved"), failed: false }))
        .catch((error: unknown) => setMessage({ text: messageForError(isDanError(error) ? error.code : undefined, t, error instanceof Error ? error.message : undefined), failed: true }))
        .finally(() => setBusy(false));
    } catch (error) {
      setMessage({ text: messageForError(isDanError(error) ? error.code : undefined, t), failed: true });
    }
  };

  // Card payments need Stripe connected (Integrations). Only the owner, signed in to the cloud, can ask.
  const payments = usePaymentsStatus();
  const stripeMissing = payments.status ? !payments.status.cardPayments : false;

  const rows = (list: typeof ORDER_ROWS) =>
    list.map((row) => {
      const locked = row.key === "uberDirect" && !setup.uberReady && !settings.uberDirect;
      // Greyed with a way to connect while its service is not connected (RK, 27 Nov 2026).
      const missing = row.key === "uberDirect" ? !setup.uberReady : row.key === "stripe" ? stripeMissing : false;
      return (
        <li key={row.key} className="flex items-center justify-between gap-4 py-3">
          <div className={`min-w-0 ${missing ? "opacity-70" : ""}`}>
            <p className="font-display text-lg">{t(row.label)}</p>
            <p className="text-sm text-ink-soft">{t(row.hint)}</p>
            {missing ? (
              <Link
                href={`${settingsRoute("integrations")}/${row.key === "uberDirect" ? "uber" : "stripe"}`}
                className="inline-flex min-h-11 items-center text-sm text-accent-ink underline"
                data-testid={`connect-${row.key}`}
              >
                {t(row.key === "uberDirect" ? "orderingConnectUber" : "orderingConnectStripe")} ›
              </Link>
            ) : null}
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings[row.key]}
            aria-label={t(row.label)}
            disabled={!isOwner || locked}
            data-testid={`switch-${row.key}`}
            className={`relative h-11 w-20 shrink-0 cursor-pointer border transition-colors active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 ${settings[row.key] ? "border-ink bg-ink" : "border-rule bg-paper-deep"}`}
            onClick={() => toggle(row.key)}
          >
            <span className={`absolute top-1 size-8 bg-paper transition-[left] ${settings[row.key] ? "left-[calc(100%-2.25rem)]" : "left-1"}`} aria-hidden />
          </button>
        </li>
      );
    });

  return (
    <div className="max-w-3xl">
      <p className="mb-6 text-ink-soft">{t("orderingLede")}</p>
      {!isOwner ? (
        <p className="mb-6 border-l-2 border-accent pl-3" data-testid="ordering-owner-only">
          {t("orderingOwnerOnly")}
        </p>
      ) : null}

      <section aria-labelledby="ordering-methods">
        <h2 id="ordering-methods" className="font-display text-2xl">
          {t("orderingMethods")}
        </h2>
        <ul className="mt-2 divide-y divide-rule border-y border-rule">{rows(ORDER_ROWS)}</ul>
        {delivering ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField name="delivery-fee" label={t("deliveryFee")} inputMode="decimal" value={fee} disabled={!isOwner} hint={t("deliveryMoneyHint")} onChange={(event) => setFee(event.target.value)} />
            <TextField name="delivery-minimum" label={t("deliveryMinimum")} inputMode="decimal" value={minimum} disabled={!isOwner} onChange={(event) => setMinimum(event.target.value)} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="ordering-payments" className="mt-8">
        <h2 id="ordering-payments" className="font-display text-2xl">
          {t("orderingPayments")}
        </h2>
        <ul className="mt-2 divide-y divide-rule border-y border-rule">{rows(PAY_ROWS)}</ul>
      </section>

      {showBank ? (
        <section aria-labelledby="ordering-bank" className="mt-8" data-testid="bank-details">
          <h2 id="ordering-bank" className="font-display text-2xl">
            {t("bankTitle")}
          </h2>
          <p className="mt-1 mb-4 text-sm text-ink-soft">{t("bankHint")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="bank-name" label={t("bankName")} value={bank.accountName} disabled={!isOwner} autoComplete="off" onChange={(event) => setBank({ ...bank, accountName: event.target.value })} />
            <TextField name="bank-prefix" label={t("bankPrefix")} value={bank.referencePrefix} disabled={!isOwner} autoComplete="off" hint={t("bankPrefixHint")} onChange={(event) => setBank({ ...bank, referencePrefix: event.target.value })} />
            <TextField name="bank-sort-code" label={t("bankSortCode")} inputMode="numeric" value={bank.sortCode} disabled={!isOwner} autoComplete="off" placeholder="12-34-56" onChange={(event) => setBank({ ...bank, sortCode: event.target.value })} />
            <TextField name="bank-account" label={t("bankAccount")} inputMode="numeric" value={bank.accountNumber} disabled={!isOwner} autoComplete="off" placeholder="12345678" onChange={(event) => setBank({ ...bank, accountNumber: event.target.value })} />
          </div>
        </section>
      ) : null}

      {message ? (
        <p className={`mt-6 border-l-2 pl-3 ${message.failed ? "border-accent text-accent-ink" : "border-[#2f7d4f]"}`} role={message.failed ? "alert" : "status"} data-testid="ordering-message">
          {message.text}
        </p>
      ) : null}
      {isOwner ? (
        <Button variant="accent" className="mt-6 min-h-12 px-8" disabled={busy} onClick={save}>
          {t("orderingSave")}
        </Button>
      ) : null}
    </div>
  );
}
