"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cloudLogin, findShop, joinWaitlist } from "@/lib/cloud";
import { isDanError } from "@/lib/errors";
import { pingServer } from "@/lib/graphql-client";
import { messageForError, useI18n } from "@/lib/i18n";
import { useSessionRedirect, useShop } from "@/lib/shop-context";
import { SignedOutPage } from "./brand-header";
import { Button, Kicker, Splash, TextField } from "./ui";

/**
 * The first page: sign in to a shop in the Dan cloud (the owner with an
 * email, the counter with the shop's address name and PIN), join the waiting
 * list, or try the demo. A shop with its own server connects at /connect.
 */
export function SignInScreen() {
  const { t } = useI18n();
  const { ready, session } = useSessionRedirect("shop");
  const shop = useShop();
  const router = useRouter();
  const [mode, setMode] = useState<"owner" | "pin">("owner");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shopName, setShopName] = useState(() => shop.persisted.lastShopName ?? "");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A device that last used a shop server by its address goes back to that page.
  // So does one opened from the shop's own machine, which is the shop server.
  const lastWay = shop.persisted.lastWay;
  useEffect(() => {
    if (!ready || session) return;
    if (lastWay === "server") {
      router.replace("/connect");
      return;
    }
    if (lastWay === "cloud" || typeof window === "undefined" || !/^https?:$/.test(window.location.protocol)) return;
    let cancelled = false;
    pingServer(window.location.origin)
      .then(() => {
        if (!cancelled) router.replace("/connect");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ready, session, lastWay, router]);

  if (ready && session) return <Splash />;

  const fail = (caught: unknown, wrong: "errSignIn" | "errUnauthorized") => {
    const code = isDanError(caught) ? caught.code : undefined;
    setError(code === "unauthorized" ? t(wrong) : messageForError(code, t, caught instanceof Error ? caught.message : undefined));
  };

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode === "owner") {
      if (!email.includes("@")) return setError(t("signInEmailInvalid"));
      if (!password) return setError(t("loginPasswordRequired"));
      setBusy(true);
      try {
        await shop.adoptCloudSession(await cloudLogin(email.trim(), password));
        // The page can stay in memory after it is left: the password does not stay with it.
        setPassword("");
        router.push("/shop/orders");
      } catch (caught) {
        fail(caught, "errSignIn");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!shopName.trim()) return setError(t("signInShopNotFound"));
    if (!/^\d{4,6}$/.test(pin)) return setError(t("loginPinInvalid"));
    setBusy(true);
    try {
      const found = await findShop(shopName).catch((caught: unknown) => {
        if (isDanError(caught) && caught.code === "not_found") throw new SignInProblem(t("signInShopNotFound"));
        throw caught;
      });
      const ping = await pingServer(found.staffUrl);
      if (!ping.auth.pin) throw new SignInProblem(t("signInNoPin"));
      await shop.loginCloudPin(found, pin, ping);
      setPin("");
      router.push("/shop/orders");
    } catch (caught) {
      if (caught instanceof SignInProblem) setError(caught.message);
      else fail(caught, "errUnauthorized");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SignedOutPage>
      <p className="mt-4 text-lg leading-relaxed text-ink-soft">{t("signInLede")}</p>

      <form className="mt-8 border-t border-rule pt-6" onSubmit={signIn} data-testid="sign-in">
        <Kicker>{t("signInKicker")}</Kicker>
        <h1 className="mt-1 font-display text-4xl leading-none">{t("signInTitle")}</h1>
        <div className="mt-4 flex gap-2" role="group" aria-label={t("signInTitle")}>
          <Button
            type="button"
            variant={mode === "owner" ? "ink" : "line"}
            aria-pressed={mode === "owner"}
            onClick={() => {
              setMode("owner");
              setError(null);
            }}
          >
            {t("signInOwnerTab")}
          </Button>
          <Button
            type="button"
            variant={mode === "pin" ? "ink" : "line"}
            aria-pressed={mode === "pin"}
            onClick={() => {
              setMode("pin");
              setError(null);
            }}
          >
            {t("signInPinTab")}
          </Button>
        </div>
        <div className="mt-4 space-y-4">
          {mode === "owner" ? (
            <>
              <TextField
                label={t("loginEmail")}
                id="signin-email"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <TextField
                label={t("loginPassword")}
                id="signin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                hint={t("signInForgot")}
                required
              />
            </>
          ) : (
            <>
              <TextField
                label={t("signInShopName")}
                id="signin-shop"
                name="shop-name"
                value={shopName}
                onChange={(event) => setShopName(event.target.value)}
                hint={t("signInShopNameHint")}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                required
              />
              <TextField
                label={t("loginPin")}
                id="signin-pin"
                name="pin"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]*"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                hint={t("loginPinHint")}
                required
              />
            </>
          )}
        </div>
        {error ? (
          <p className="mt-4 border-l-2 border-accent pl-3 text-sm" role="alert" data-testid="sign-in-error">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="accent" className="mt-4 w-full" disabled={busy}>
          {busy ? t("loginSubmitting") : t("loginSubmit")}
        </Button>
      </form>

      <Waitlist />

      <div className="mt-8 border-t border-rule pt-6">
        <p className="text-center font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("connectOr")}</p>
        <button
          type="button"
          data-testid="demo-button"
          className="mt-4 flex min-h-16 w-full cursor-pointer flex-col items-center justify-center bg-accent px-4 py-3 text-on-accent hover:bg-accent-deep"
          onClick={() => {
            shop.enterDemo();
            router.push("/shop/orders");
          }}
        >
          <span className="font-display text-2xl leading-none">{t("connectDemo")}</span>
          <span className="mt-1 font-zh text-sm tracking-[0.2em]">{t("connectDemoZh")}</span>
        </button>
        <p className="mt-3 text-center text-sm text-ink-soft">{t("connectDemoHint")}</p>
        <p className="mt-6 text-center">
          <Link
            href="/connect"
            className="inline-flex min-h-11 items-center font-display text-sm tracking-[0.14em] text-accent-ink uppercase"
            data-testid="use-shop-server"
          >
            {t("signInUseServer")}
          </Link>
        </p>
      </div>
    </SignedOutPage>
  );
}

/** A problem with its own words, shown as they are. */
class SignInProblem extends Error {}

/** Anyone can leave an email. Dan invites people from the list by hand. */
function Waitlist() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ busy: boolean; done: boolean; error: string | null }>({ busy: false, done: false, error: null });

  async function join(event: React.FormEvent) {
    event.preventDefault();
    if (!email.includes("@")) return setState({ busy: false, done: false, error: t("errEmail") });
    setState({ busy: true, done: false, error: null });
    try {
      await joinWaitlist(email.trim());
      setState({ busy: false, done: true, error: null });
    } catch (caught) {
      const code = isDanError(caught) ? caught.code : undefined;
      setState({ busy: false, done: false, error: messageForError(code, t, caught instanceof Error ? caught.message : undefined) });
    }
  }

  return (
    <form className="mt-8 border-t border-rule pt-6" onSubmit={join} data-testid="waitlist">
      <Kicker>{t("waitlistTitle")}</Kicker>
      <p className="mt-1 text-ink-soft">{t("waitlistLede")}</p>
      {state.done ? (
        <p className="mt-4 border-l-2 border-ink pl-3" role="status" data-testid="waitlist-done">
          {t("waitlistDone")}
        </p>
      ) : (
        <>
          <div className="mt-4">
            <TextField
              label={t("waitlistEmail")}
              name="waitlist-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={state.error ?? undefined}
              required
            />
          </div>
          <Button type="submit" variant="line" className="mt-4 w-full" disabled={state.busy}>
            {state.busy ? t("waitlistSubmitting") : t("waitlistSubmit")}
          </Button>
        </>
      )}
    </form>
  );
}
