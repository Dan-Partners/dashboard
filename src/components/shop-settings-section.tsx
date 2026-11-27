"use client";

import { useState } from "react";
import { isDanError } from "@/lib/errors";
import { messageForError, useI18n } from "@/lib/i18n";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { Button, TextField } from "./ui";

type Saving = { busy: boolean; message: string | null; failed: boolean };
const IDLE: Saving = { busy: false, message: null, failed: false };

function Status({ state, testId }: { state: Saving; testId: string }) {
  if (!state.message) return null;
  return (
    <p className={`text-sm ${state.failed ? "text-accent-ink" : "text-ink-soft"}`} role={state.failed ? "alert" : "status"} data-testid={testId}>
      {state.message}
    </p>
  );
}

/**
 * Owner only: the shop's name, address and phone, as tickets and the ordering
 * site show them. A shop that joined through the Dan cloud starts with only
 * its name.
 */
export function ShopDetailsSection() {
  const { t } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const current = shop.persisted.session?.shop;
  const [name, setName] = useState(current?.name ?? "");
  const [nameZh, setNameZh] = useState(current?.nameZh ?? "");
  const [address, setAddress] = useState(current?.address ?? "");
  const [city, setCity] = useState(current?.city ?? "");
  const [phone, setPhone] = useState(current?.phone ?? "");
  const [state, setState] = useState<Saving>(IDLE);
  if (!isOwner || !current) return null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setState({ busy: false, message: t("errGeneric"), failed: true });
    setState({ busy: true, message: null, failed: false });
    try {
      await shop.saveShop({ name, nameZh, address, city, phone });
      setState({ busy: false, message: t("shopDetailsSaved"), failed: false });
    } catch (caught) {
      const code = isDanError(caught) ? caught.code : undefined;
      setState({ busy: false, message: messageForError(code, t, caught instanceof Error ? caught.message : undefined), failed: true });
    }
  }

  return (
    <section aria-labelledby="shop-details-title" className="no-print mt-10 max-w-3xl border-t border-rule pt-8" data-testid="shop-details">
      <h2 id="shop-details-title" className="font-display text-2xl">
        {t("shopDetailsTitle")}
      </h2>
      <p className="mt-1 mb-4 text-ink-soft">{t("shopDetailsLede")}</p>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField name="shop-details-name" label={t("shopDetailsName")} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} required />
          <TextField name="shop-details-name-zh" label={t("shopDetailsNameZh")} value={nameZh} maxLength={40} onChange={(event) => setNameZh(event.target.value)} />
          <TextField name="shop-details-address" label={t("shopDetailsAddress")} value={address} maxLength={200} autoComplete="street-address" onChange={(event) => setAddress(event.target.value)} />
          <TextField name="shop-details-city" label={t("shopDetailsCity")} value={city} maxLength={80} autoComplete="address-level2" onChange={(event) => setCity(event.target.value)} />
          <TextField name="shop-details-phone" label={t("shopDetailsPhone")} value={phone} maxLength={30} inputMode="tel" autoComplete="tel" onChange={(event) => setPhone(event.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="accent" disabled={state.busy}>
            {t("shopDetailsSave")}
          </Button>
          <Status state={state} testId="shop-details-status" />
        </div>
      </form>
    </section>
  );
}
