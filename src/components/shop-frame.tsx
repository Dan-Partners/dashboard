"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { FEATURES } from "@/lib/features";
import { formatStamp } from "@/lib/format";
import { useI18n, type CopyKey } from "@/lib/i18n";
import { CREATE_ORDER_ROUTE } from "@/lib/focus";
import { useIsOwner, useSessionRedirect, useShop } from "@/lib/shop-context";
import { viewGloss, viewName, viewRoute } from "@/lib/views";
import { SETTINGS_ROUTE } from "@/lib/settings";
import { CloudNotice, KeyRefusedNotice } from "./cloud-notice";
import { ConnectionStatus } from "./connection-status";
import { FocusDialog } from "./focus-dialog";
import { FocusFrame } from "./focus-frame";
import { DanGlyph, DanMark } from "./mark";
import { PrintStrip } from "./print-strip";
import { ServerSwitchNotice } from "./server-switch-notice";
import { Button, Dialog, Splash } from "./ui";

type NavLink = { href: string; label: CopyKey; gloss: CopyKey; ownerOnly?: boolean; cloudOnly?: boolean };

/** Before the owner's views in the menu. */
const FIRST_LINKS: NavLink[] = [{ href: "/shop/orders", label: "navOrders", gloss: "navOrdersZh" }];

/** After them. */
const LINKS: NavLink[] = [
  { href: "/shop/menu", label: "navMenu", gloss: "navMenuZh" },
  { href: "/shop/ticket", label: "navTicket", gloss: "navTicketZh" },
  ...(FEATURES.stamps ? [{ href: "/shop/loyalty", label: "navStamps" as CopyKey, gloss: "navStampsZh" as CopyKey }] : []),
  { href: "/shop/sales", label: "navSales", gloss: "navSalesZh", ownerOnly: true },
  // Last, at the bottom of the menu: setting-up tools.
  // Every setting, one place (DAN-33). The counter PIN finds Tables & printers there.
  { href: SETTINGS_ROUTE, label: "navSettings", gloss: "navSettingsZh" },
];

export function ShopFrame({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const { ready, session } = useSessionRedirect("home");
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!ready || !session || (session.mode === "remote" && !shop.snapshot && !shop.remoteError)) {
    return (
      <>
        <Splash />
        <div hidden>{children}</div>
      </>
    );
  }

  const focus = shop.persisted.focus;
  if (focus) {
    return (
      <FocusFrame session={session} focus={focus}>
        {children}
      </FocusFrame>
    );
  }

  const tillOn = shop.snapshot?.ordering.settings.till ?? true;
  // What a link shows: its name, and the name in the other language.
  type Shown = { href: string; name: string; gloss: string };
  const fixed = (list: NavLink[]): Shown[] =>
    list
      .filter((link) => (isOwner || !link.ownerOnly) && (!link.cloudOnly || Boolean(session.cloudUrl)))
      .map((link) => ({ href: link.href, name: t(link.label), gloss: t(link.gloss) }));
  // The owner's views sit where Kitchen and Pass always did: after the till.
  const viewLinks: Shown[] = (shop.snapshot?.views ?? []).map((view) => ({ href: viewRoute(view.id), name: viewName(view, locale), gloss: viewGloss(view, locale) }));
  const links: Shown[] = [...fixed(FIRST_LINKS), ...viewLinks, ...fixed(LINKS)];
  // On a phone, creating an order is one tap from anywhere: it sits in the bar where the till was.
  const newOrder: Shown[] = tillOn ? [{ href: CREATE_ORDER_ROUTE, name: t("navNewOrder"), gloss: t("navNewOrderZh") }] : [];
  const mobile = [...links.filter((link) => link.href === "/shop/orders"), ...newOrder, ...links.filter((link) => ["/shop/menu", "/shop/loyalty"].includes(link.href))];
  const inMore = (href: string) => href.startsWith("/shop/view/") || ["/shop/ticket", "/shop/sales", SETTINGS_ROUTE].includes(href);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[13.75rem_minmax(0,1fr)]">
      <aside className="chrome no-print hidden border-r border-rule bg-paper text-ink md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:overflow-y-auto">
        {/* The seal: white on vermilion, as on the icon, in every theme. */}
        <Link href="/shop/orders" className="flex items-center gap-3 bg-seal px-4 py-4 text-on-seal">
          <DanGlyph height={44} />
          <span>
            <span className="block font-zh text-[10px] tracking-[0.3em] opacity-90">{t("appPun")}</span>
            <span className="block font-wordmark text-4xl leading-none">Dan</span>
          </span>
        </Link>
        <div className="border-b-[3px] border-ink px-4 pt-5 pb-4">
          <p className="font-display text-2xl leading-tight">{session.shop.name}</p>
          <p className="font-zh text-accent-ink">{session.shop.nameZh}</p>
          <p className="text-sm text-ink-soft">{session.shop.city}</p>
          <p className="mt-2 text-sm text-ink-soft" data-testid="signed-in-as">
            {t("signedInAs")} <span className="font-display text-ink">{t(session.staff.role === "owner" ? "roleOwner" : "roleCounter")}</span>
          </p>
        </div>
        <nav className="flex flex-col px-2 pt-3" aria-label="Dan">
          {links.map((link) => {
            const active = pathname === link.href || ((link.href === "/shop/orders" || link.href === SETTINGS_ROUTE) && pathname.startsWith(`${link.href}/`));
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-baseline justify-between gap-3 px-3 py-2.5 ${active ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-deep hover:text-ink"}`}
              >
                <span className="font-display text-xl leading-none">{link.name}</span>
                <span className="font-zh text-xs">{link.gloss}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2 px-4 pt-8 pb-5">
          <FocusButton label={t("focusButton")} gloss={t("focusButtonZh")} onClick={() => setFocusOpen(true)} />
          <LanguageToggle locale={locale} setLocale={setLocale} labelEn={t("langEn")} labelZh={t("langZh")} />
          {session.mode === "demo" ? (
            <Button variant="ghost" className="w-full" onClick={() => setConfirmReset(true)}>
              {t("resetDemo")}
            </Button>
          ) : null}
          <Button variant="line" className="w-full" onClick={() => shop.logout()} data-testid="sign-out">
            {t(session.home === "cloud" ? "signOut" : "disconnect")}
          </Button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="chrome-sm no-print sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-rule bg-paper/95 px-4 py-3 text-ink backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3 md:hidden">
            <DanMark size={32} />
            <div className="min-w-0">
              <p className="font-wordmark text-2xl leading-none">Dan</p>
              <p className="truncate text-sm text-ink-soft">
                {session.shop.nameZh ? `${session.shop.name} · ${session.shop.nameZh}` : session.shop.name}
              </p>
            </div>
          </div>
          <p className="hidden font-display text-lg md:block">
            {session.shop.name}
            <span className="ml-3 font-zh text-base text-accent-ink">{session.shop.nameZh}</span>
          </p>
          <div className="flex shrink-0 items-center gap-5">
            <ConnectionStatus session={session} />
            <p className="hidden font-display text-sm tracking-[0.14em] text-ink-soft uppercase sm:block">{formatStamp(now)}</p>
          </div>
        </header>

        {shop.notice ? (
          <Link
            href={shop.notice.href ?? "/shop/orders"}
            className="no-print flex items-baseline justify-between gap-4 border-b border-rule bg-accent px-4 py-3 text-on-accent md:px-8"
            onClick={() => shop.dismissNotice()}
          >
            <span className="font-display text-sm tracking-[0.16em] uppercase">{t("noticeOnline")}</span>
            <span className="font-display text-xl">
              {shop.notice.title}
              <span className="ml-3 font-body text-base">{shop.notice.detail}</span>
            </span>
          </Link>
        ) : null}

        <ServerSwitchNotice />
        <PrintStrip />

        {/* While the cloud stands in, the strip above says so; no alarm as well. */}
        {shop.remoteError && shop.servers.inUse === "shop" ? (
          <div className="no-print flex items-center justify-between gap-4 border-b border-rule px-4 py-3 md:px-8" role="alert">
            <p>{t("serverDown")}</p>
            <Button variant="line" onClick={() => void shop.retryRemote()}>
              {t("retry")}
            </Button>
          </div>
        ) : null}

        <KeyRefusedNotice />
        <CloudNotice session={session} />

        <main id="main" className="px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-10">
          {children}
        </main>

        <nav
          className="no-print fixed inset-x-0 bottom-0 z-20 grid border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)] md:hidden"
          style={{ gridTemplateColumns: `repeat(${mobile.length + 1}, minmax(0, 1fr))` }}
          aria-label="Dan"
        >
          {mobile.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center border-t-[3px] ${active ? "border-accent text-accent-ink" : "border-transparent text-ink-soft"}`}
              >
                <span className="font-display text-sm leading-none">{link.name}</span>
                <span className="font-zh text-[10px]">{link.gloss}</span>
              </Link>
            );
          })}
          <button
            type="button"
            className="flex min-h-14 cursor-pointer flex-col items-center justify-center border-t-[3px] border-transparent text-ink-soft"
            onClick={() => setMore(true)}
          >
            <span className="font-display text-sm leading-none">{t("navMore")}</span>
            <span className="font-zh text-[10px]">{locale === "zh-Hant" ? "More" : "更多"}</span>
          </button>
        </nav>
      </div>

      <Dialog open={more} title={t("moreTitle")} onClose={() => setMore(false)}>
        <div className="flex flex-col">
          {links.filter((link) => inMore(link.href)).map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex min-h-12 items-baseline justify-between border-b border-rule"
              onClick={() => setMore(false)}
            >
              <span className="font-display text-2xl">{link.name}</span>
              <span className="font-zh text-accent-ink">{link.gloss}</span>
            </Link>
          ))}
          <div className="mt-4 space-y-2">
            <FocusButton
              label={t("focusButton")}
              gloss={t("focusButtonZh")}
              onClick={() => {
                setMore(false);
                setFocusOpen(true);
              }}
            />
            <LanguageToggle locale={locale} setLocale={setLocale} labelEn={t("langEn")} labelZh={t("langZh")} />
          </div>
          {session.mode === "demo" ? (
            <Button
              variant="ghost"
              className="mt-3 w-full"
              onClick={() => {
                setMore(false);
                setConfirmReset(true);
              }}
            >
              {t("resetDemo")}
            </Button>
          ) : null}
          <Button
            variant="line"
            className="mt-2 w-full"
            onClick={() => {
              setMore(false);
              shop.logout();
            }}
          >
            {t(session.home === "cloud" ? "signOut" : "disconnect")}
          </Button>
        </div>
      </Dialog>

      <Dialog open={confirmReset} title={t("resetTitle")} onClose={() => setConfirmReset(false)}>
        <p className="text-ink-soft">{t("resetBody")}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setConfirmReset(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="accent"
            className="flex-1"
            onClick={() => {
              shop.resetDemo();
              setConfirmReset(false);
            }}
          >
            {t("resetAction")}
          </Button>
        </div>
      </Dialog>

      <FocusDialog open={focusOpen} onClose={() => setFocusOpen(false)} />
    </div>
  );
}

function LanguageToggle({
  locale,
  setLocale,
  labelEn,
  labelZh,
}: {
  locale: "en" | "zh-Hant";
  setLocale: (locale: "en" | "zh-Hant") => void;
  labelEn: string;
  labelZh: string;
}) {
  return (
    <div className="grid grid-cols-2 border border-rule" role="group" aria-label="Language">
      <button
        type="button"
        aria-pressed={locale === "en"}
        className={`min-h-11 cursor-pointer font-display text-sm ${locale === "en" ? "bg-ink text-paper" : "text-ink-soft"}`}
        onClick={() => setLocale("en")}
      >
        {labelEn}
      </button>
      <button
        type="button"
        aria-pressed={locale === "zh-Hant"}
        className={`min-h-11 cursor-pointer font-zh text-sm ${locale === "zh-Hant" ? "bg-ink text-paper" : "text-ink-soft"}`}
        onClick={() => setLocale("zh-Hant")}
      >
        {labelZh}
      </button>
    </div>
  );
}

function FocusButton({ label, gloss, onClick }: { label: string; gloss: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="focus-button"
      className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 border border-ink bg-ink px-3 text-paper hover:bg-ink/90"
      onClick={onClick}
    >
      <span className="font-display text-lg leading-none">{label}</span>
      <span className="font-zh text-xs">{gloss}</span>
    </button>
  );
}
