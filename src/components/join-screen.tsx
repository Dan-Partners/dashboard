"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addressNameFrom, checkAddress, getInvite, joinShop, linkToken, type ShopTemplate } from "@/lib/cloud";
import { DanError, isDanError } from "@/lib/errors";
import { messageForError, useI18n, type CopyKey } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import { SignedOutPage } from "./brand-header";
import { Button, Kicker, TextField } from "./ui";

type LinkState = { name: "checking" } | { name: "invalid"; message: string } | { name: "ready"; token: string; email: string };

/**
 * Reads the token a link carries after its # and takes it out of the address
 * bar, so it is not left in the page's address or history.
 */
export function useLinkToken(check: (token: string) => Promise<{ email: string }>): LinkState {
  const { t } = useI18n();
  const [state, setState] = useState<LinkState>({ name: "checking" });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = linkToken(window.location.hash);
    window.history.replaceState(null, "", window.location.pathname);
    // A link with no token is answered the same way as one the cloud refuses.
    const asked = token ? check(token).then(({ email }) => ({ token, email })) : Promise.reject(new DanError("link_invalid", t("linkInvalid")));
    asked
      .then((found) => setState({ name: "ready", ...found }))
      .catch((caught: unknown) => {
        const code = isDanError(caught) ? caught.code : undefined;
        setState({ name: "invalid", message: messageForError(code, t, caught instanceof Error ? caught.message : undefined) });
      });
  }, [check, t]);
  return state;
}

/** What a link that cannot be used shows, and while it is being checked. */
export function LinkNotReady({ state }: { state: Exclude<LinkState, { name: "ready" }> }) {
  const { t } = useI18n();
  return (
    <div className="mt-8 border-t border-rule pt-6">
      {state.name === "checking" ? (
        <p role="status">{t("linkChecking")}</p>
      ) : (
        <>
          <p className="border-l-2 border-accent pl-3" role="alert" data-testid="link-invalid">
            {state.message}
          </p>
          <p className="mt-6">
            <Link href="/" className="inline-flex min-h-11 items-center font-display text-sm tracking-[0.14em] text-accent-ink uppercase">
              {t("backToSignIn")}
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

const TEMPLATES: { value: ShopTemplate; label: CopyKey; hint: CopyKey }[] = [
  { value: "online_shop", label: "joinTemplateOnline", hint: "joinTemplateOnlineHint" },
  { value: "restaurant", label: "joinTemplateRestaurant", hint: "joinTemplateRestaurantHint" },
];

/** Opened from an invite link: the invited person makes their shop. */
export function JoinScreen() {
  const { t } = useI18n();
  const link = useLinkToken(getInvite);
  return (
    <SignedOutPage>
      {link.name === "ready" ? <JoinForm token={link.token} email={link.email} /> : <LinkNotReady state={link} />}
      {link.name === "ready" ? null : <span className="sr-only">{t("joinTitle")}</span>}
    </SignedOutPage>
  );
}

function JoinForm({ token, email }: { token: string; email: string }) {
  const { t } = useI18n();
  const shop = useShop();
  const router = useRouter();
  const [ownerName, setOwnerName] = useState("");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState("");
  const [addressName, setAddressName] = useState("");
  const [addressEdited, setAddressEdited] = useState(false);
  const [template, setTemplate] = useState<ShopTemplate>("online_shop");
  const [address, setAddress] = useState<{ name: string; available: boolean; address: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wanted = addressEdited ? addressName : addressNameFrom(shopName);

  // Says whether the address name is free, a moment after typing stops.
  useEffect(() => {
    if (wanted.length < 3) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      checkAddress(wanted)
        .then((found) => {
          if (!cancelled) setAddress({ name: wanted, ...found });
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [wanted]);
  const checked = address && address.name === wanted ? address : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ownerName.trim() || !shopName.trim() || wanted.length < 3) return setError(t("joinInvalid"));
    if (password.length < 10) return setError(t("errPasswordWeak"));
    setBusy(true);
    setError(null);
    try {
      const session = await joinShop({ invite: token, ownerName, password, shopName, addressName: wanted, template });
      await shop.adoptCloudSession(session);
      // The page can stay in memory after it is left: the password does not stay with it.
      setPassword("");
      // A new shop starts with its menu.
      router.push("/shop/menu");
    } catch (caught) {
      const code = isDanError(caught) ? caught.code : undefined;
      setError(messageForError(code, t, caught instanceof Error ? caught.message : undefined));
      setBusy(false);
    }
  }

  return (
    <form className="mt-8 border-t border-rule pt-6" onSubmit={submit} data-testid="join">
      <Kicker>{t("joinKicker")}</Kicker>
      <h1 className="mt-1 font-display text-4xl leading-none">{t("joinTitle")}</h1>
      <p className="mt-3 text-ink-soft">
        {t("joinFor")} <span className="text-ink" data-testid="join-email">{email}</span>
      </p>
      <div className="mt-5 space-y-4">
        <TextField label={t("joinOwnerName")} id="join-owner-name" name="owner-name" autoComplete="name" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} required />
        {/* The email goes with the password, for the browser's password manager. */}
        <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
        <TextField
          label={t("joinPassword")}
          id="join-password" name="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint={t("joinPasswordHint")}
          minLength={10}
          required
        />
        <TextField label={t("joinShopName")} id="join-shop-name" name="shop-name" autoComplete="organization" value={shopName} onChange={(event) => setShopName(event.target.value)} maxLength={80} required />
        <div>
          <TextField
            label={t("joinAddress")}
            id="join-address-name" name="address-name"
            value={wanted}
            onChange={(event) => {
              setAddressEdited(true);
              setAddressName(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40));
            }}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            required
          />
          <p className="mt-2 text-sm leading-relaxed text-ink-soft" role="status" data-testid="join-address" data-available={checked ? String(checked.available) : undefined}>
            {checked ? (
              <>
                <span className="text-ink">{checked.address}</span> {t(checked.available ? "joinAddressFree" : "joinAddressTaken")}
              </>
            ) : (
              t("joinAddressHint")
            )}
          </p>
        </div>
        <fieldset>
          <legend className="font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("joinTemplate")}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {TEMPLATES.map((option) => (
              <label
                key={option.value}
                className={`flex min-h-16 cursor-pointer flex-col justify-center border px-3 py-2 ${template === option.value ? "border-ink bg-paper-deep" : "border-rule"}`}
              >
                <span className="flex items-center gap-2 font-display text-lg leading-tight">
                  <input type="radio" name="template" value={option.value} checked={template === option.value} onChange={() => setTemplate(option.value)} />
                  {t(option.label)}
                </span>
                <span className="mt-1 text-sm text-ink-soft">{t(option.hint)}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-soft">{t("joinTemplateNote")}</p>
        </fieldset>
      </div>
      {error ? (
        <p className="mt-4 border-l-2 border-accent pl-3 text-sm" role="alert" data-testid="join-error">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="accent" className="mt-5 w-full" disabled={busy}>
        {busy ? t("joinSubmitting") : t("joinSubmit")}
      </Button>
    </form>
  );
}
