"use client";

import { useState } from "react";
import { isDanError } from "@/lib/errors";
import { phoneDigits } from "@/lib/format";
import { messageForError, useI18n } from "@/lib/i18n";
import { STAMP_GOAL } from "@/lib/seed";
import { useShop } from "@/lib/shop-context";
import type { Customer } from "@/lib/types";
import { Button, PageTitle } from "./ui";

export function LoyaltyBook() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const customers = shop.snapshot?.customers ?? [];
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const digits = phoneDigits(query);
  const match =
    customers.find((customer) => customer.id === selected) ??
    (digits.length >= 7 ? customers.find((customer) => customer.id === digits) : undefined);

  async function run(action: () => Promise<Customer>) {
    setBusy(true);
    setError(null);
    try {
      const customer = await action();
      setSelected(customer.id);
      setQuery(customer.phone);
    } catch (caught) {
      const code = isDanError(caught) ? caught.code : undefined;
      setError(messageForError(code, t, caught instanceof Error ? caught.message : undefined));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageTitle title={t("loyaltyTitle")} gloss={locale === "zh-Hant" ? "Stamps" : "印花"} />
      <p className="mb-5 max-w-xl text-ink-soft">{t("loyaltyLede")}</p>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (digits.length < 7) {
            setError(t("loyaltyNeedPhone"));
            return;
          }
          setError(null);
          setSelected(digits);
        }}
      >
        <label className="block flex-1">
          <span className="font-display text-[0.72rem] tracking-[0.16em] uppercase text-ink-soft">{t("loyaltyPhone")}</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(null);
            }}
            inputMode="tel"
            className="mt-1 w-full min-h-12 border border-rule bg-paper-raised px-3 text-lg"
          />
        </label>
        <Button type="submit" className="sm:self-end">
          {t("loyaltyFind")}
        </Button>
      </form>
      {error ? (
        <p className="mt-3 border-l-2 border-vermilion pl-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {digits.length >= 7 && !match ? (
        <form
          className="mt-6 max-w-md border border-rule bg-paper-raised p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) {
              setError(t("loyaltyNeedName"));
              return;
            }
            void run(() => shop.createCustomer({ phone: query, name }));
          }}
        >
          <p>{t("loyaltyMissing")}</p>
          <label className="mt-3 block">
            <span className="font-display text-[0.72rem] tracking-[0.16em] uppercase text-ink-soft">{t("loyaltyName")}</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full min-h-11 border border-rule bg-paper px-3" />
          </label>
          <Button type="submit" variant="vermilion" className="mt-3" disabled={busy}>
            {t("loyaltyOpen")}
          </Button>
        </form>
      ) : null}

      {match ? <Card customer={match} busy={busy} onStamp={() => void run(() => shop.addStamp(match.phone))} onRedeem={() => void run(() => shop.redeemReward(match.phone))} /> : null}

      <section className="mt-10">
        <h2 className="font-display text-2xl">{t("loyaltyBook")}</h2>
        {customers.length === 0 ? <p className="mt-2 text-ink-soft">{t("loyaltyNone")}</p> : null}
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {customers.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                className="flex min-h-14 w-full cursor-pointer items-baseline justify-between gap-3 py-2 text-left"
                onClick={() => {
                  setSelected(customer.id);
                  setQuery(customer.phone);
                  setError(null);
                }}
              >
                <span>
                  <span className="block font-display text-xl">{customer.name}</span>
                  <span className="text-sm text-ink-soft">{customer.phone}</span>
                </span>
                <span className="font-display text-vermilion">
                  {customer.stamps}/{STAMP_GOAL}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Card({
  customer,
  busy,
  onStamp,
  onRedeem,
}: {
  customer: Customer;
  busy: boolean;
  onStamp: () => void;
  onRedeem: () => void;
}) {
  const { t } = useI18n();
  const full = customer.stamps >= STAMP_GOAL;
  return (
    <section className="mt-6 max-w-md border border-rule bg-paper-raised p-5">
      <h2 className="font-display text-3xl leading-none">{customer.name}</h2>
      <p className="mt-1 text-ink-soft">{customer.phone}</p>
      <p className="mt-4 font-display text-[0.72rem] tracking-[0.16em] uppercase text-ink-soft">
        {t("loyaltyStamps")} {customer.stamps}/{STAMP_GOAL}
        {customer.rewardsRedeemed ? ` · ${t("loyaltyRedeemed")} ${customer.rewardsRedeemed}` : ""}
      </p>
      <div className="mt-3 grid grid-cols-5 gap-3" aria-hidden>
        {Array.from({ length: STAMP_GOAL }, (_, index) => (
          <span
            key={index}
            className={`aspect-square rounded-full border border-ink ${index < customer.stamps ? "bg-vermilion border-vermilion" : "bg-transparent"}`}
          />
        ))}
      </div>
      <p className="mt-4 text-sm">{full ? t("loyaltyFull") : t("loyaltyReward")}</p>
      <div className="mt-4 flex gap-2">
        <Button variant="vermilion" disabled={busy || full} onClick={onStamp}>
          {t("loyaltyAdd")}
        </Button>
        <Button variant="line" disabled={busy || !full} onClick={onRedeem}>
          {t("loyaltyRedeem")}
        </Button>
      </div>
    </section>
  );
}
