"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isDanError } from "@/lib/errors";
import { messageForError, useI18n } from "@/lib/i18n";
import { pingServer } from "@/lib/http-client";
import { useSessionRedirect, useShop } from "@/lib/shop-context";
import { normalizeServerUrl } from "@/lib/url";
import type { ServerPing } from "@/lib/types";
import { DanMark } from "./mark";
import { Button, Kicker, Splash, TextField } from "./ui";

type Phase = { name: "url" } | { name: "login"; baseUrl: string; ping: ServerPing };

export function ConnectScreen() {
  const { t } = useI18n();
  const { ready, session } = useSessionRedirect("shop");
  const shop = useShop();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>({ name: "url" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"email" | "pin">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");

  if (ready && session) return <Splash />;

  async function connect(raw: string) {
    setBusy(true);
    setError(null);
    try {
      const canonical = normalizeServerUrl(raw);
      const ping = await pingServer(canonical);
      shop.rememberServer(canonical);
      setUrl(canonical);
      setAuthMode(ping.auth.password ? "email" : "pin");
      setPhase({ name: "login", baseUrl: canonical, ping });
    } catch (caught) {
      const code = isDanError(caught) ? caught.code : undefined;
      setError(messageForError(code, t, caught instanceof Error ? caught.message : undefined));
    } finally {
      setBusy(false);
    }
  }

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (phase.name !== "login") return;
    if (authMode === "email") {
      if (!email.includes("@")) {
        setError(t("loginEmailInvalid"));
        return;
      }
      if (!password) {
        setError(t("loginPasswordRequired"));
        return;
      }
    } else if (!/^\d{4,6}$/.test(pin)) {
      setError(t("loginPinInvalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await shop.loginRemote(
        phase.baseUrl,
        authMode === "email" ? { email: email.trim(), password } : { pin },
        phase.ping,
      );
      router.push("/shop/orders");
    } catch (caught) {
      const code = isDanError(caught) ? caught.code : undefined;
      setError(messageForError(code, t, caught instanceof Error ? caught.message : undefined));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-0.375rem)] w-full max-w-md flex-col justify-center px-5 py-12">
      <div className="flex items-end gap-4">
        <DanMark size={76} title="Dan" />
        <div className="min-w-0 pb-1">
          <p className="font-zh text-sm tracking-[0.42em] text-vermilion">{t("appPun")}</p>
          <p className="font-display text-6xl leading-none">Dan</p>
        </div>
      </div>
      <p className="mt-6 text-lg leading-relaxed text-ink-soft">{t("connectLede")}</p>

      {phase.name === "url" ? (
        <form
          className="mt-8 border-t border-rule pt-6"
          onSubmit={(event) => {
            event.preventDefault();
            void connect(url);
          }}
        >
          <Kicker>{t("connectKicker")}</Kicker>
          <h1 className="mt-1 font-display text-4xl leading-none">{t("connectTitle")}</h1>
          <div className="mt-5">
            <TextField
              label={t("connectUrl")}
              name="server-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder={t("connectUrlPlaceholder")}
              hint={error ? undefined : t("connectHint")}
              error={error ?? undefined}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="url"
              required
            />
          </div>
          <Button type="submit" className="mt-4 w-full" disabled={busy}>
            {busy ? t("connectSubmitting") : t("connectSubmit")}
          </Button>
          {shop.persisted.recentServers.length > 0 ? (
            <div className="mt-6">
              <Kicker>{t("connectRecent")}</Kicker>
              <ul className="mt-2 divide-y divide-rule border-y border-rule">
                {shop.persisted.recentServers.map((recent) => (
                  <li key={recent} className="flex items-center gap-2">
                    <button
                      type="button"
                      className="min-h-11 flex-1 cursor-pointer truncate text-left"
                      onClick={() => {
                        setUrl(recent);
                        void connect(recent);
                      }}
                    >
                      {recent}
                    </button>
                    <button
                      type="button"
                      className="min-h-11 cursor-pointer px-2 font-display text-sm tracking-[0.14em] text-ink-soft uppercase"
                      onClick={() => shop.forgetServer(recent)}
                    >
                      {t("connectForget")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </form>
      ) : (
        <form className="mt-8 border-t border-rule pt-6" onSubmit={signIn}>
          <Kicker>{phase.ping.shop.city}</Kicker>
          <h1 className="mt-1 font-display text-4xl leading-none">{phase.ping.shop.name}</h1>
          <p className="font-zh text-lg text-vermilion">{phase.ping.shop.nameZh}</p>
          <p className="mt-2 truncate text-sm text-ink-soft">{phase.baseUrl}</p>
          <button
            type="button"
            className="mt-2 min-h-11 cursor-pointer font-display text-sm tracking-[0.14em] text-vermilion uppercase"
            onClick={() => {
              setPhase({ name: "url" });
              setError(null);
            }}
          >
            {t("connectChange")}
          </button>
          <div className="mt-4 flex gap-2">
            {phase.ping.auth.password ? (
              <Button type="button" variant={authMode === "email" ? "ink" : "line"} onClick={() => setAuthMode("email")}>
                {t("loginUseEmail")}
              </Button>
            ) : null}
            {phase.ping.auth.pin ? (
              <Button type="button" variant={authMode === "pin" ? "ink" : "line"} onClick={() => setAuthMode("pin")}>
                {t("loginUsePin")}
              </Button>
            ) : null}
          </div>
          <div className="mt-4 space-y-4">
            {authMode === "email" ? (
              <>
                <TextField
                  label={t("loginEmail")}
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
                <TextField
                  label={t("loginPassword")}
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </>
            ) : (
              <TextField
                label={t("loginPin")}
                name="pin"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]*"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                hint={t("loginPinHint")}
                required
              />
            )}
          </div>
          {error ? (
            <p className="mt-4 border-l-2 border-vermilion pl-3 text-sm" role="alert" data-testid="connect-error">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="vermilion" className="mt-4 w-full" disabled={busy}>
            {busy ? t("loginSubmitting") : t("loginSubmit")}
          </Button>
        </form>
      )}

      <div className="mt-8 border-t border-rule pt-6">
        <p className="text-center font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("connectOr")}</p>
        <button
          type="button"
          data-testid="demo-button"
          className="mt-4 flex min-h-16 w-full cursor-pointer flex-col items-center justify-center bg-vermilion px-4 py-3 text-paper hover:bg-vermilion-deep"
          onClick={() => {
            shop.enterDemo();
            router.push("/shop/orders");
          }}
        >
          <span className="font-display text-2xl leading-none">{t("connectDemo")}</span>
          <span className="mt-1 font-zh text-sm tracking-[0.2em]">{t("connectDemoZh")}</span>
        </button>
        <p className="mt-3 text-center text-sm text-ink-soft">{t("connectDemoHint")}</p>
      </div>
    </div>
  );
}
