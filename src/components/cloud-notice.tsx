"use client";

import { useEffect, useState } from "react";
import { dayKey } from "@/lib/format";
import { GraphQLDanClient } from "@/lib/graphql-client";
import { useI18n } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import type { Session } from "@/lib/types";
import { Button } from "./ui";

const HIDDEN_KEY = "dan.cloudNoticeHiddenOn";
const CHECK_EVERY_MS = 60 * 60 * 1000;

function hiddenToday(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === dayKey(new Date());
  } catch {
    return false;
  }
}

/**
 * Tells the owner when the shop server has no Dan cloud: the shop's data is
 * on that machine only, with nothing to recover from if it dies (there are no
 * backups; the cloud's live copy is the off-site copy). Only for the owner on
 * a real shop server; the counter PIN never sees it. It can be hidden for the
 * rest of the day, and comes back the next day until it is fixed.
 */
export function CloudNotice({ session }: { session: Session }) {
  const { t } = useI18n();
  const [noCloud, setNoCloud] = useState(false);
  const [hidden, setHidden] = useState(false);
  const owner = session.mode === "remote" && session.staff.role === "owner";
  const { serverUrl, token } = session;

  useEffect(() => {
    if (!owner || !serverUrl || !token) return;
    let cancelled = false;
    const check = () => {
      setHidden(hiddenToday());
      new GraphQLDanClient(serverUrl, token)
        .getSyncStatus()
        .then((status) => {
          if (!cancelled) setNoCloud(status.mode === "not_running");
        })
        // An older shop server, or one not answering: say nothing rather than guess.
        .catch(() => undefined);
    };
    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [owner, serverUrl, token]);

  if (!owner || !noCloud || hidden) return null;

  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule border-l-[6px] border-l-accent bg-paper-raised px-4 py-3 md:px-8" role="alert" data-testid="cloud-notice">
      <p className="min-w-0 max-w-3xl font-display">{t("cloudOff")}</p>
      <Button
        variant="line"
        onClick={() => {
          try {
            window.localStorage.setItem(HIDDEN_KEY, dayKey(new Date()));
          } catch {
            // Hidden for this page only.
          }
          setHidden(true);
        }}
      >
        {t("noticeHideToday")}
      </Button>
    </div>
  );
}

/**
 * Tells everyone at the counter when the Dan cloud no longer accepts the shop
 * server's key (RK, 27 Nov 2026, DAN-34). The machine carries on alone, as it
 * does when the internet is down, and the shop's settings cannot be changed.
 * Not hidden: it stays until Dan sorts the key out.
 */
export function KeyRefusedNotice() {
  const { t } = useI18n();
  const shop = useShop();
  if (shop.settingsAccess !== "key_refused") return null;
  return (
    <div className="no-print border-b border-rule border-l-[6px] border-l-accent bg-paper-raised px-4 py-3 md:px-8" role="alert" data-testid="key-refused">
      <p className="max-w-3xl font-display">{t("keyRefused")}</p>
    </div>
  );
}
