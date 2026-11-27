"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n, type CopyKey } from "@/lib/i18n";
import { SETTINGS_ROUTE, SETTINGS_SECTIONS, sectionsFor, settingsRoute, stripeState, type IntegrationState, type SettingsSection } from "@/lib/settings";
import type { SettingsAccess } from "@/lib/server-health";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { usePaymentsStatus } from "./payments-view";
import { ShopDetailsSection } from "./shop-settings-section";
import { ThemeButton, ThemeDialog } from "./theme-dialog";
import { PageTitle } from "./ui";

const READ_ONLY_COPY: Partial<Record<SettingsAccess, CopyKey>> = {
  offline: "settingsInCloudOffline",
  key_refused: "settingsInCloudKey",
  sign_in_again: "settingsInCloudSignIn",
};

/**
 * Why the shop's settings can only be looked at now, or null when they can
 * be changed (RK, 27 Nov 2026, DAN-34: a shop server's settings are the Dan
 * cloud's, saved only while the machine is connected with a valid key).
 */
export function useSettingsReadOnly(): CopyKey | null {
  return READ_ONLY_COPY[useShop().settingsAccess] ?? null;
}

/** Says why the settings below can only be looked at. Nothing when they can be changed. */
export function SettingsReadOnlyNote({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  const shop = useShop();
  const copy = useSettingsReadOnly();
  if (!copy) return null;
  return (
    <p className={`max-w-xl border-l-2 border-accent pl-3 ${className}`} role="status" data-testid="settings-read-only" data-reason={shop.settingsAccess}>
      {t(copy)}
    </p>
  );
}

/**
 * Settings: one list of sections, each its own page (RK, 27 Nov 2026,
 * DAN-33). The counter PIN sees Tables & printers only.
 */
export function SettingsIndex() {
  const { t, locale } = useI18n();
  const isOwner = useIsOwner();
  const shown = sectionsFor(isOwner);
  return (
    <div className="max-w-3xl" data-testid="settings-index">
      <PageTitle title={t("settingsTitle")} gloss={locale === "zh-Hant" ? "Settings" : "設定"} />
      <p className="-mt-2 mb-6 text-ink-soft">{t(isOwner ? "settingsLede" : "settingsPinNote")}</p>
      {isOwner ? <SettingsReadOnlyNote className="mb-6" /> : null}
      <ul className="divide-y divide-rule border-y border-rule">
        {SETTINGS_SECTIONS.filter((section) => shown.includes(section.id)).map((section) => (
          <li key={section.id}>
            <Link
              href={settingsRoute(section.id)}
              className="flex min-h-16 items-center gap-4 px-1 py-3 hover:bg-paper-deep active:bg-paper-deep"
              data-testid="settings-section"
              data-section={section.id}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="font-display text-xl leading-tight">{t(section.label)}</span>
                  <span className="font-zh text-sm text-ink-soft">{t(section.gloss)}</span>
                </span>
                <span className="block text-sm text-ink-soft">{t(section.hint)}</span>
              </span>
              <span aria-hidden className="font-display text-2xl text-ink-soft">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One section's page: its title, the way back to Settings, and its settings.
 * A section the viewer may not see says so instead (the server refuses the
 * PIN's changes either way). `sub` names an integration's own page.
 */
export function SettingsFrame({ section, sub, children }: { section: SettingsSection; sub?: { label: CopyKey; gloss: CopyKey }; children: React.ReactNode }) {
  const { t } = useI18n();
  const isOwner = useIsOwner();
  const entry = SETTINGS_SECTIONS.find((candidate) => candidate.id === section)!;
  const allowed = sectionsFor(isOwner).includes(section);
  // Printers are the machine's own, so Tables & printers is never read only.
  const readOnly = useSettingsReadOnly() !== null && section !== "tables";
  const parent = sub ? { href: settingsRoute(section), label: t(entry.label) } : { href: SETTINGS_ROUTE, label: t("settingsBack") };
  return (
    <div data-testid="settings-page" data-section={section}>
      <PageTitle className="mb-4" title={sub ? t(sub.label) : t(entry.label)} gloss={sub ? t(sub.gloss) : t(entry.gloss)} />
      <p className="no-print mb-6">
        <Link href={parent.href} className="inline-flex min-h-11 items-center font-display text-ink-soft underline" data-testid="settings-back">
          ← {parent.label}
        </Link>
      </p>
      {allowed ? (
        <>
          {readOnly ? <SettingsReadOnlyNote className="mb-6" /> : null}
          {/* Every control in the section is off while the settings cannot be saved. */}
          <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0" data-testid="settings-fields">
            {children}
          </fieldset>
        </>
      ) : (
        <p className="max-w-xl border-l-2 border-accent pl-3" data-testid="settings-owner-only">
          {t("settingsOwnerOnly")}
        </p>
      )}
    </div>
  );
}

/** Settings, Shop: the shop's details and the theme. Staff and their PINs are under Settings, Staff (DAN-44). */
export function ShopSettings() {
  const { t } = useI18n();
  const [themeOpen, setThemeOpen] = useState(false);
  return (
    <div className="max-w-3xl">
      <section aria-labelledby="theme-title" className="no-print" data-testid="theme-section">
        <h2 id="theme-title" className="font-display text-2xl">
          {t("themeSection")}
        </h2>
        <p className="mt-1 mb-4 text-ink-soft">{t("themeSectionLede")}</p>
        {/* A dialog, not a form on the page: every change applies at once, and the counter behind it is the preview. */}
        <ThemeButton label={t("theme")} gloss={t("themeZh")} className="w-full max-w-xs" onClick={() => setThemeOpen(true)} />
        <ThemeDialog open={themeOpen} onClose={() => setThemeOpen(false)} />
      </section>
      <ShopDetailsSection />
    </div>
  );
}

const STATE_COPY: Record<IntegrationState, CopyKey> = {
  connected: "integrationsConnected",
  attention: "integrationsAttention",
  not_connected: "integrationsNotConnected",
  needs_cloud: "integrationsNeedCloud",
  checking: "integrationsChecking",
};

/** Settings, Integrations: Stripe and Uber Direct, each with how it stands, each its own page. */
export function IntegrationsList() {
  const { t } = useI18n();
  const shop = useShop();
  const session = shop.persisted.session;
  const cloud = Boolean(session?.cloudUrl) && session?.mode !== "demo";
  const payments = usePaymentsStatus();
  // The shop server says when Uber Direct is set up (its account connected and checked).
  const uber: IntegrationState = !cloud ? "needs_cloud" : shop.snapshot?.ordering.uberReady ? "connected" : "not_connected";
  const stripe: IntegrationState = payments.error ? "attention" : stripeState(payments.status, cloud && Boolean(session?.cloudToken));
  const rows: { id: "stripe" | "uber"; name: CopyKey; what: CopyKey; state: IntegrationState }[] = [
    { id: "stripe", name: "stripeName", what: "stripeWhat", state: stripe },
    { id: "uber", name: "uberName", what: "uberWhat", state: uber },
  ];
  return (
    <div className="max-w-3xl">
      <p className="mb-6 max-w-xl text-ink-soft">{t("integrationsLede")}</p>
      <ul className="divide-y divide-rule border-y border-rule">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`${settingsRoute("integrations")}/${row.id}`}
              className="flex min-h-16 items-center gap-4 px-1 py-3 hover:bg-paper-deep active:bg-paper-deep"
              data-testid="integration"
              data-integration={row.id}
              data-state={row.state}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xl leading-tight">{t(row.name)}</span>
                <span className="block text-sm text-ink-soft">{t(row.what)}</span>
              </span>
              <span
                className={`shrink-0 font-display text-sm ${row.state === "connected" ? "text-ink" : row.state === "attention" ? "text-accent-ink" : "text-ink-soft"}`}
                data-testid="integration-state"
              >
                {row.state === "connected" ? "● " : row.state === "attention" ? "▲ " : "○ "}
                {t(STATE_COPY[row.state])}
              </span>
              <span aria-hidden className="font-display text-2xl text-ink-soft">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
