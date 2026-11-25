"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { allStations, enterFullscreen, exitFullscreen, fullscreenAvailable, POSITION_ROUTE, type Position } from "@/lib/focus";
import { useI18n, type CopyKey } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import { STATION_LABEL } from "@/lib/stations";
import { writePersisted } from "@/lib/storage";
import type { Session } from "@/lib/types";
import { ConnectionStatus } from "./connection-status";
import { ServerSwitchNotice } from "./server-switch-notice";
import { Button } from "./ui";

export const POSITION_LABEL: Record<Position, CopyKey> = {
  kitchen: "navKitchen",
  till: "navTill",
  pass: "navPass",
  board: "focusBoard",
};

/** How long the lock must be held to leave focus mode. */
export const HOLD_MS = 3000;

function subscribeFullscreen(listener: () => void) {
  document.addEventListener("fullscreenchange", listener);
  document.addEventListener("webkitfullscreenchange", listener);
  return () => {
    document.removeEventListener("fullscreenchange", listener);
    document.removeEventListener("webkitfullscreenchange", listener);
  };
}

function useIsFullscreen() {
  return useSyncExternalStore(
    subscribeFullscreen,
    () => Boolean(document.fullscreenElement ?? (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement),
    () => false,
  );
}

/**
 * The screen of a tablet locked to one position: no menu, one job, a line at
 * the top saying so, and a lock in the corner held for 3 seconds to leave.
 */
export function FocusFrame({ session, position, children }: { session: Session; position: Position; children: React.ReactNode }) {
  const { t } = useI18n();
  const shop = useShop();
  const pathname = usePathname();
  const router = useRouter();
  const fullscreen = useIsFullscreen();
  const stations = shop.persisted.kitchenStations;
  const route = POSITION_ROUTE[position];

  // Marks the page as locked, for the touch rules in globals.css.
  useEffect(() => {
    document.documentElement.dataset.focus = position;
    return () => {
      delete document.documentElement.dataset.focus;
    };
  }, [position]);

  // Locked means locked: any other screen goes back to this position's.
  useEffect(() => {
    if (pathname !== route) router.replace(route);
  }, [pathname, route, router]);

  const filter =
    position === "kitchen" && !allStations(stations)
      ? ` · ${t("focusFilterBefore")}${stations.map((station) => t(STATION_LABEL[station])).join(", ")}${t("focusFilterAfter")}`
      : "";

  return (
    <div className="focus-screen min-h-dvh" data-focus={position}>
      {/* On a phone the lock and lights take the top row (lock in the corner), the line goes under. */}
      <header className="chrome-sm no-print sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule bg-paper/95 py-2 pr-2 pl-4 text-ink backdrop-blur md:pl-6">
        <p className="order-2 min-w-0 basis-full pb-1 font-display text-base leading-tight sm:order-1 sm:flex-1 sm:basis-0 sm:pb-0 md:text-lg" data-testid="focus-status" role="status">
          <span className="text-accent-ink">{t("focusOn")}:</span> {t(POSITION_LABEL[position])}
          {filter}
          <span className="text-ink-soft"> · {t("focusHold")}</span>
        </p>
        <div className="order-1 ml-auto flex shrink-0 items-center gap-3 sm:order-2">
          {!fullscreen && fullscreenAvailable() ? (
            <Button variant="line" className="min-h-11 px-3 text-base" onClick={enterFullscreen} data-testid="focus-fullscreen" aria-label={t("focusFullscreen")}>
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
              <span className="hidden sm:inline">{t("focusFullscreen")}</span>
            </Button>
          ) : null}
          <ConnectionStatus session={session} compact />
          <HoldToUnlock />
        </div>
      </header>
      <ServerSwitchNotice />
      {shop.remoteError && shop.servers.inUse === "shop" ? (
        <p className="no-print border-b border-rule px-4 py-2 md:px-6" role="alert">
          {t("serverDown")}
        </p>
      ) : null}
      <main id="main" className="px-3 py-4 md:px-6 md:py-5">
        {children}
      </main>
    </div>
  );
}

/** The corner lock. A tap only says to hold it; 3 seconds held leaves focus mode. */
function HoldToUnlock() {
  const { t } = useI18n();
  const router = useRouter();
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!hint) return;
    const hide = window.setTimeout(() => setHint(false), 2500);
    return () => window.clearTimeout(hide);
  }, [hint]);

  const start = () => {
    window.clearTimeout(timer.current);
    setHolding(true);
    setHint(false);
    timer.current = window.setTimeout(() => {
      setHolding(false);
      exitFullscreen();
      writePersisted({ focus: null });
      router.replace("/shop/orders");
    }, HOLD_MS);
  };
  const stop = () => {
    if (!holding) return;
    window.clearTimeout(timer.current);
    setHolding(false);
    setHint(true);
  };

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={t("focusUnlock")}
        data-testid="focus-unlock"
        data-holding={holding ? "true" : "false"}
        className="relative grid size-12 cursor-pointer touch-none place-items-center select-none [-webkit-touch-callout:none]"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          start();
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if ((event.key === " " || event.key === "Enter") && !event.repeat) {
            event.preventDefault();
            start();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") stop();
        }}
        onBlur={stop}
      >
        <svg viewBox="0 0 36 36" className="absolute inset-0 size-12 -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r="16" fill="none" stroke="var(--dan-rule)" strokeWidth="3" />
          {holding ? (
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke="var(--dan-accent)"
              strokeWidth="3"
              pathLength={100}
              strokeDasharray="100"
              style={{ animation: `dan-hold ${HOLD_MS}ms linear forwards` }}
            />
          ) : null}
        </svg>
        <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="5" y="11" width="14" height="10" rx="1.5" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      </button>
      {holding || hint ? (
        <p className="absolute top-full right-0 z-30 mt-1 whitespace-nowrap bg-ink px-2 py-1 text-sm text-paper" role="status">
          {holding ? t("focusKeepHolding") : t("focusHold")}
        </p>
      ) : null}
    </div>
  );
}
