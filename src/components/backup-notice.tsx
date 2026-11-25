"use client";

import { useEffect, useState } from "react";
import { dayKey } from "@/lib/format";
import { GraphQLDanClient } from "@/lib/graphql-client";
import { useI18n, type CopyKey } from "@/lib/i18n";
import type { BackupHealth, BackupStatus, Session } from "@/lib/types";
import { Button } from "./ui";

const HIDDEN_KEY = "dan.backupNoticeHiddenOn";
const CHECK_EVERY_MS = 60 * 60 * 1000;

const WORDS: Partial<Record<BackupHealth, CopyKey>> = {
  off: "backupOff",
  failed: "backupFailed",
  stale: "backupStale",
};

function hiddenToday(): boolean {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === dayKey(new Date());
  } catch {
    return false;
  }
}

/**
 * Tells the owner when the shop's data is not safe off the shop server:
 * backups off, last night's failed, or none for two days. Only for the owner
 * on a real shop server; the counter PIN never sees it. It can be hidden for
 * the rest of the day, and comes back the next day until it is fixed.
 */
export function BackupNotice({ session }: { session: Session }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const owner = session.mode === "remote" && session.staff.role === "owner";
  const { serverUrl, token } = session;

  useEffect(() => {
    if (!owner || !serverUrl || !token) return;
    let cancelled = false;
    const check = () => {
      setHidden(hiddenToday());
      new GraphQLDanClient(serverUrl, token)
        .getBackupStatus()
        .then((next) => {
          if (!cancelled) setStatus(next);
        })
        // An older shop server has no backup status. Say nothing rather than guess.
        .catch(() => undefined);
    };
    check();
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [owner, serverUrl, token]);

  const words = status ? WORDS[status.health] : undefined;
  if (!owner || !status || !words || hidden) return null;

  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule border-l-[6px] border-l-accent bg-paper-raised px-4 py-3 md:px-8" role="alert" data-testid="backup-notice" data-health={status.health}>
      <div className="min-w-0 max-w-3xl">
        <p className="font-display">{t(words)}</p>
        {status.health === "failed" && status.lastResult ? <p className="mt-1 text-sm text-ink-soft">{status.lastResult}</p> : null}
      </div>
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
        {t("backupHideToday")}
      </Button>
    </div>
  );
}
