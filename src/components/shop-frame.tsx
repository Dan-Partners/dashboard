"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { formatStamp } from "@/lib/format";
import { useI18n, type CopyKey } from "@/lib/i18n";
import { useSessionRedirect, useShop } from "@/lib/shop-context";
import { DanMark } from "./mark";
import { Button, Dialog, Splash } from "./ui";

const LINKS: { href: string; label: CopyKey; gloss: CopyKey }[] = [
  { href: "/shop/orders", label: "navOrders", gloss: "navOrdersZh" },
  { href: "/shop/till", label: "navTill", gloss: "navTillZh" },
  { href: "/shop/menu", label: "navMenu", gloss: "navMenuZh" },
  { href: "/shop/ticket", label: "navTicket", gloss: "navTicketZh" },
  { href: "/shop/loyalty", label: "navStamps", gloss: "navStampsZh" },
  { href: "/shop/sales", label: "navSales", gloss: "navSalesZh" },
];

export function ShopFrame({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  const shop = useShop();
  const { ready, session } = useSessionRedirect("home");
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
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

  const mobile = LINKS.filter((link) => ["/shop/orders", "/shop/till", "/shop/menu", "/shop/loyalty"].includes(link.href));

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[13.75rem_minmax(0,1fr)]">
      <aside className="no-print hidden border-r border-rule px-4 py-5 md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:overflow-y-auto">
        <Link href="/shop/orders" className="flex items-center gap-2">
          <DanMark size={36} />
          <span className="font-display text-3xl leading-none">Dan</span>
        </Link>
        <p className="mt-6 font-display text-2xl leading-tight">{session.shop.name}</p>
        <p className="font-zh text-vermilion">{session.shop.nameZh}</p>
        <p className="text-sm text-ink-soft">{session.shop.city}</p>
        <nav className="mt-8 flex flex-col" aria-label="Dan">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-baseline justify-between gap-3 border-l-2 px-2 py-2 ${active ? "border-vermilion text-ink" : "border-transparent text-ink-soft"}`}
              >
                <span className="font-display text-xl leading-none">{t(link.label)}</span>
                <span className="font-zh text-xs">{t(link.gloss)}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2 pt-8">
          <LanguageToggle locale={locale} setLocale={setLocale} labelEn={t("langEn")} labelZh={t("langZh")} />
          {session.mode === "demo" ? (
            <Button variant="ghost" className="w-full" onClick={() => setConfirmReset(true)}>
              {t("resetDemo")}
            </Button>
          ) : null}
          <Button variant="line" className="w-full" onClick={() => shop.logout()}>
            {t("disconnect")}
          </Button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-rule bg-paper/95 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex min-w-0 items-center gap-3 md:hidden">
            <DanMark size={32} />
            <div className="min-w-0">
              <p className="font-display text-2xl leading-none">Dan</p>
              <p className="truncate text-sm text-ink-soft">
                {session.shop.name} · {session.shop.nameZh}
              </p>
            </div>
          </div>
          <p className="hidden font-display text-lg md:block">
            {session.shop.name}
            <span className="ml-3 font-zh text-base text-vermilion">{session.shop.nameZh}</span>
          </p>
          <p className="font-display text-sm tracking-[0.14em] text-ink-soft uppercase">{formatStamp(now)}</p>
        </header>

        {shop.notice ? (
          <Link
            href={shop.notice.href ?? "/shop/orders"}
            className="no-print flex items-baseline justify-between gap-4 border-b border-rule bg-vermilion px-4 py-3 text-paper md:px-8"
            onClick={() => shop.dismissNotice()}
          >
            <span className="font-display text-sm tracking-[0.16em] uppercase">{t("noticeOnline")}</span>
            <span className="font-display text-xl">
              {shop.notice.title}
              <span className="ml-3 font-body text-base">{shop.notice.detail}</span>
            </span>
          </Link>
        ) : null}

        {shop.remoteError ? (
          <div className="no-print flex items-center justify-between gap-4 border-b border-rule px-4 py-3 md:px-8" role="alert">
            <p>{t("serverDown")}</p>
            <Button variant="line" onClick={() => void shop.retryRemote()}>
              {t("retry")}
            </Button>
          </div>
        ) : null}

        <main id="main" className="px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-10">
          {children}
        </main>

        <nav
          className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)] md:hidden"
          aria-label="Dan"
        >
          {mobile.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center ${active ? "text-vermilion" : "text-ink-soft"}`}
              >
                <span className="font-display text-sm leading-none">{t(link.label)}</span>
                <span className="font-zh text-[10px]">{t(link.gloss)}</span>
              </Link>
            );
          })}
          <button
            type="button"
            className="flex min-h-14 cursor-pointer flex-col items-center justify-center text-ink-soft"
            onClick={() => setMore(true)}
          >
            <span className="font-display text-sm leading-none">{t("navMore")}</span>
            <span className="font-zh text-[10px]">{locale === "zh-Hant" ? "More" : "更多"}</span>
          </button>
        </nav>
      </div>

      <Dialog open={more} title={t("moreTitle")} onClose={() => setMore(false)}>
        <div className="flex flex-col">
          {LINKS.filter((link) => link.href === "/shop/ticket" || link.href === "/shop/sales").map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex min-h-12 items-baseline justify-between border-b border-rule"
              onClick={() => setMore(false)}
            >
              <span className="font-display text-2xl">{t(link.label)}</span>
              <span className="font-zh text-vermilion">{t(link.gloss)}</span>
            </Link>
          ))}
          <div className="mt-4">
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
            {t("disconnect")}
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
            variant="vermilion"
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
