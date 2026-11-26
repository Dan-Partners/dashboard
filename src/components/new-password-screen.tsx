"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getReset, resetPassword } from "@/lib/cloud";
import { isDanError } from "@/lib/errors";
import { messageForError, useI18n } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import { SignedOutPage } from "./brand-header";
import { LinkNotReady, useLinkToken } from "./join-screen";
import { Button, Kicker, TextField } from "./ui";

/** Opened from a reset link Dan sent: the owner chooses a new password. */
export function NewPasswordScreen() {
  const link = useLinkToken(getReset);
  return <SignedOutPage>{link.name === "ready" ? <NewPasswordForm token={link.token} email={link.email} /> : <LinkNotReady state={link} />}</SignedOutPage>;
}

function NewPasswordForm({ token, email }: { token: string; email: string }) {
  const { t } = useI18n();
  const shop = useShop();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 10) return setError(t("errPasswordWeak"));
    if (password !== again) return setError(t("newPasswordMismatch"));
    setBusy(true);
    setError(null);
    try {
      // Signing in here replaces whoever was signed in on this device.
      await shop.adoptCloudSession(await resetPassword(token, password));
      // The page can stay in memory after it is left: the password does not stay with it.
      setPassword("");
      setAgain("");
      router.push("/shop/orders");
    } catch (caught) {
      const code = isDanError(caught) ? caught.code : undefined;
      setError(messageForError(code, t, caught instanceof Error ? caught.message : undefined));
      setBusy(false);
    }
  }

  return (
    <form className="mt-8 border-t border-rule pt-6" onSubmit={submit} data-testid="new-password">
      <Kicker>{t("signInKicker")}</Kicker>
      <h1 className="mt-1 font-display text-4xl leading-none">{t("newPasswordTitle")}</h1>
      <p className="mt-3 text-ink-soft">
        {t("newPasswordFor")} <span className="text-ink">{email}</span>
      </p>
      <div className="mt-5 space-y-4">
        <input type="email" name="email" autoComplete="username" value={email} readOnly hidden />
        <TextField
          label={t("newPasswordLabel")}
          id="reset-password"
          name="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint={t("joinPasswordHint")}
          minLength={10}
          required
        />
        <TextField
          label={t("newPasswordAgain")}
          id="reset-password-again"
          name="new-password-again"
          type="password"
          autoComplete="new-password"
          value={again}
          onChange={(event) => setAgain(event.target.value)}
          required
        />
      </div>
      {error ? (
        <p className="mt-4 border-l-2 border-accent pl-3 text-sm" role="alert" data-testid="new-password-error">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="accent" className="mt-5 w-full" disabled={busy}>
        {busy ? t("loginSubmitting") : t("newPasswordSubmit")}
      </Button>
    </form>
  );
}
