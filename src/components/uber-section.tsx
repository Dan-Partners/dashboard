"use client";

import { useEffect, useState } from "react";
import { isDanError } from "@/lib/errors";
import { GraphQLDanClient } from "@/lib/graphql-client";
import { formatPence, parsePoundsToPence } from "@/lib/format";
import { messageForError, useI18n, type CopyKey } from "@/lib/i18n";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { checkUberOptions, DEFAULT_UBER, webhookAddress, type UberBooking, type UberKeys, type UberOptions } from "@/lib/uber";
import { Button, TextField } from "./ui";

const BOOKINGS: { value: UberBooking; label: CopyKey }[] = [
  { value: "on_accept", label: "uberOnAccept" },
  { value: "on_ready", label: "uberOnReady" },
  { value: "manual", label: "uberManual" },
];

const EMPTY_KEYS: UberKeys = { customerId: "", clientId: "", clientSecret: "", webhookSigningKey: "" };

const pounds = (pence: number | null) => (pence === null ? "" : (pence / 100).toFixed(2));

/** "-1.50" or "0.50" to pence; null when it is not money. */
function signedPence(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  const negative = trimmed.startsWith("-");
  const pence = parsePoundsToPence(trimmed.replace(/^[-+]/, ""));
  return pence === null ? null : negative ? -pence : pence;
}

/**
 * The shop's own Uber Direct account: connected through the Dan cloud (the
 * keys go there and nowhere else), then the owner's options. The counter
 * PIN sees whether it is connected, read-only.
 */
export function UberSection({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const session = shop.persisted.session;
  const demo = session?.mode === "demo";
  const [options, setOptions] = useState<UberOptions | null>(demo ? DEFAULT_UBER : null);
  const [keys, setKeys] = useState<UberKeys>(EMPTY_KEYS);
  const [booking, setBooking] = useState<UberBooking>("on_accept");
  const [cook, setCook] = useState("15");
  const [adjust, setAdjust] = useState("0.00");
  const [freeOver, setFreeOver] = useState("");
  const [minimum, setMinimum] = useState("");
  const [postcode, setPostcode] = useState("");
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const show = (next: UberOptions) => {
    setOptions(next);
    setBooking(next.booking);
    setCook(String(next.cookMinutes));
    setAdjust((next.feeAdjustPence / 100).toFixed(2));
    setFreeOver(pounds(next.freeOverPence));
    setMinimum(pounds(next.minimumPence));
    setPostcode(next.pickupPostcode);
  };

  // The Dan cloud holds the Uber account, so it is asked first; the shop's own
  // server has the same options a moment later, through the sync.
  const cloud = session?.cloudUrl && session.cloudToken ? new GraphQLDanClient(session.cloudUrl, session.cloudToken) : null;
  const onUberServer = <T,>(work: (client: GraphQLDanClient) => Promise<T>) => (cloud ? work(cloud) : shop.onServer(work));

  useEffect(() => {
    if (demo) return;
    let live = true;
    void onUberServer((client) => client.getUberOptions())
      .then((loaded) => {
        if (live) show(loaded);
      })
      .catch(() => {
        if (live) setOptions(DEFAULT_UBER);
      });
    return () => {
      live = false;
    };
    // Loaded once per visit; saving updates it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);

  const failed = (error: unknown) =>
    setMessage({ text: messageForError(isDanError(error) ? error.code : undefined, t, error instanceof Error ? error.message : undefined), failed: true });

  const webhook = webhookAddress(session?.cloudUrl, session?.addressName);

  const connect = () => {
    if (!cloud) return;
    setMessage(null);
    setBusy(true);
    void cloud
      .connectUber(keys)
      .then((next) => {
        show(next);
        setKeys(EMPTY_KEYS);
        setMessage({ text: t("uberConnectedNow"), failed: false });
        onChanged();
      })
      .catch(failed)
      .finally(() => setBusy(false));
  };

  const disconnect = () => {
    if (!cloud) return;
    setMessage(null);
    setBusy(true);
    void cloud
      .disconnectUber()
      .then((next) => {
        show(next);
        setMessage({ text: t("uberDisconnected"), failed: false });
        onChanged();
      })
      .catch(failed)
      .finally(() => setBusy(false));
  };

  const save = () => {
    setMessage(null);
    const money = (text: string) => (text.trim() === "" ? null : parsePoundsToPence(text));
    const fee = signedPence(adjust);
    const input = {
      booking,
      cookMinutes: Number(cook),
      feeAdjustPence: fee ?? Number.NaN,
      freeOverPence: money(freeOver),
      minimumPence: money(minimum),
      pickupPostcode: postcode.trim(),
    };
    try {
      checkUberOptions(input);
    } catch (error) {
      failed(error);
      return;
    }
    setBusy(true);
    void onUberServer((client) => client.updateUberOptions(input))
      .then((next) => {
        show(next);
        setMessage({ text: t("uberSaved"), failed: false });
        onChanged();
      })
      .catch(failed)
      .finally(() => setBusy(false));
  };

  if (!options) return null;
  const editable = isOwner && !demo;

  return (
    <section aria-labelledby="ordering-uber" data-testid="uber-section">
      <h2 id="ordering-uber" className="font-display text-2xl">
        {t("uberTitle")}
      </h2>
      <p className="mt-1 mb-3 text-sm text-ink-soft">{t("uberLede")}</p>
      <p className="font-display" data-testid="uber-state">
        {options.connected ? `${t("uberConnectedTo")} ${options.accountHint}` : t("uberNotConnected")}
      </p>
      {demo ? <p className="mt-2 text-sm text-ink-soft">{t("uberDemo")}</p> : null}

      {editable && !options.connected ? (
        cloud ? (
          <div className="mt-4">
            <p className="mb-3 text-sm text-ink-soft">{t("uberKeysHint")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="uber-customer" label={t("uberCustomerId")} autoComplete="off" value={keys.customerId} onChange={(event) => setKeys({ ...keys, customerId: event.target.value })} />
              <TextField name="uber-client" label={t("uberClientId")} autoComplete="off" value={keys.clientId} onChange={(event) => setKeys({ ...keys, clientId: event.target.value })} />
              <TextField name="uber-secret" type="password" label={t("uberClientSecret")} autoComplete="off" value={keys.clientSecret} onChange={(event) => setKeys({ ...keys, clientSecret: event.target.value })} />
              <TextField name="uber-signing" type="password" label={t("uberSigningKey")} autoComplete="off" value={keys.webhookSigningKey} onChange={(event) => setKeys({ ...keys, webhookSigningKey: event.target.value })} />
            </div>
            {webhook ? (
              <p className="mt-3 text-sm">
                {t("uberWebhookHint")}{" "}
                <code className="break-all bg-paper-deep px-1" data-testid="uber-webhook">
                  {webhook}
                </code>
              </p>
            ) : null}
            <Button variant="accent" className="mt-4 min-h-12 px-6" disabled={busy} onClick={connect}>
              {t("uberConnect")}
            </Button>
          </div>
        ) : (
          <p className="mt-3 border-l-2 border-accent pl-3 text-sm" data-testid="uber-needs-cloud">
            {t("uberNeedsCloud")}
          </p>
        )
      ) : null}

      {options.connected ? (
        <div className="mt-4">
          <fieldset disabled={!editable}>
            <legend className="font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("uberBooking")}</legend>
            <div className="mt-2 space-y-1">
              {BOOKINGS.map((choice) => (
                <label key={choice.value} className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input type="radio" name="uber-booking" className="size-5" checked={booking === choice.value} onChange={() => setBooking(choice.value)} />
                  {t(choice.label)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField name="uber-cook" label={t("uberCookMinutes")} inputMode="numeric" value={cook} disabled={!editable} onChange={(event) => setCook(event.target.value)} />
            <TextField name="uber-adjust" label={t("uberFeeAdjust")} inputMode="decimal" value={adjust} disabled={!editable} onChange={(event) => setAdjust(event.target.value)} />
            <TextField name="uber-free" label={t("uberFreeOver")} inputMode="decimal" value={freeOver} disabled={!editable} onChange={(event) => setFreeOver(event.target.value)} />
            <TextField name="uber-minimum" label={t("uberMinimum")} inputMode="decimal" value={minimum} disabled={!editable} onChange={(event) => setMinimum(event.target.value)} />
            <TextField name="uber-postcode" label={t("uberPickupPostcode")} autoComplete="off" value={postcode} disabled={!editable} onChange={(event) => setPostcode(event.target.value)} />
          </div>
          {options.minimumPence !== null && !editable ? <p className="mt-2 text-sm text-ink-soft">{formatPence(options.minimumPence)}</p> : null}
          {editable ? (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="accent" className="min-h-12 px-6" disabled={busy} onClick={save}>
                {t("uberSave")}
              </Button>
              {cloud ? (
                <Button variant="line" className="min-h-12 px-6" disabled={busy} onClick={disconnect}>
                  {t("uberDisconnect")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {message ? (
        <p className={`mt-4 border-l-2 pl-3 ${message.failed ? "border-accent text-accent-ink" : "border-[#2f7d4f]"}`} role={message.failed ? "alert" : "status"} data-testid="uber-message">
          {message.text}
        </p>
      ) : null}
    </section>
  );
}

/** Settings, Integrations, Uber Direct: the shop's own Uber Direct account and how couriers are booked. */
export function UberIntegration() {
  const shop = useShop();
  return (
    <div className="max-w-3xl">
      <UberSection onChanged={() => void shop.retryRemote()} />
    </div>
  );
}
