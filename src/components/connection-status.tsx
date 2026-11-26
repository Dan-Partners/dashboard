"use client";

import { useState } from "react";
import { formatClock } from "@/lib/format";
import { useI18n, type CopyKey } from "@/lib/i18n";
import type { Link } from "@/lib/server-links";
import { useShop } from "@/lib/shop-context";
import type { Session } from "@/lib/types";
import { Dialog } from "./ui";

const LINK_WORDS: Record<Link, CopyKey> = {
  checking: "statusReconnecting",
  connected: "statusConnected",
  reconnecting: "statusReconnecting",
  offline: "statusOffline",
  not_set: "statusNotSet",
};

const LIGHT: Record<Link, string> = {
  checking: "bg-[#C98A1B]",
  connected: "bg-[#2F7D4F]",
  reconnecting: "bg-[#C98A1B]",
  offline: "bg-[#B83A2E]",
  not_set: "bg-transparent border border-ink-soft",
};

function Light({ link }: { link: Link }) {
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${LIGHT[link]}`} />;
}

/**
 * The top right of every screen: is the shop server there, is the cloud there,
 * which one the counter is using, and whether changes have reached the cloud.
 * Tap for the addresses and the last sync.
 */
export function ConnectionStatus({ session, compact = false }: { session: Session; compact?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { servers } = useShop();
  const { shop, cloud, sync, inUse } = servers;

  if (session.mode === "demo") {
    return (
      <p className="font-display text-sm tracking-[0.14em] text-ink-soft uppercase" data-testid="connection-status">
        {compact ? (
          <>
            <span className="sm:hidden">{t("statusDemoShort")}</span>
            <span className="hidden sm:inline">{t("statusDemo")}</span>
          </>
        ) : (
          t("statusDemo")
        )}
      </p>
    );
  }

  // A shop that lives in the cloud has one server and nothing to sync with.
  if (session.home === "cloud") {
    return (
      <p
        className="flex items-center gap-1.5 font-display text-sm tracking-[0.12em] text-ink uppercase"
        data-testid="connection-status"
        data-shop={shop}
        data-cloud={shop}
        data-in-use="cloud"
        data-home="cloud"
        aria-label={`${t("statusCloudHome")}: ${t(LINK_WORDS[shop])}`}
        title={session.serverUrl ?? undefined}
      >
        <Light link={shop} />
        {compact ? t("statusCloud") : t("statusCloudHome")}
      </p>
    );
  }

  // On the cloud, the shop server cannot report its sync: say what happens next.
  const syncLine =
    inUse === "cloud"
      ? t("statusSyncBack")
      : !sync || sync.mode === "not_running"
      ? t("statusSyncOff")
      : sync.mode === "synced"
        ? t("statusSynced")
        : `${t("statusWaiting")}: ${sync.pending} ${t("statusChanges")}`;

  return (
    <>
      <button
        type="button"
        className="flex cursor-pointer flex-col items-end gap-0.5 text-right"
        onClick={() => setOpen(true)}
        aria-label={`${t("statusTitle")}: ${t("statusShop")} ${t(LINK_WORDS[shop])}, ${t("statusCloud")} ${t(LINK_WORDS[cloud])}. ${syncLine}`}
        data-testid="connection-status"
        data-shop={shop}
        data-cloud={cloud}
        data-in-use={inUse}
      >
        <span className="flex items-center gap-3 font-display text-sm tracking-[0.12em] uppercase">
          <span className={`flex items-center gap-1.5 ${inUse === "shop" ? "text-ink underline decoration-2 underline-offset-4" : "text-ink-soft"}`}>
            <Light link={shop} />
            {t("statusShop")}
          </span>
          <span className={`flex items-center gap-1.5 ${inUse === "cloud" ? "text-ink underline decoration-2 underline-offset-4" : "text-ink-soft"}`}>
            <Light link={cloud} />
            {t("statusCloud")}
          </span>
        </span>
        <span className={`text-xs text-ink-soft ${compact ? "hidden sm:block" : ""}`} data-testid="sync-line">
          {syncLine}
        </span>
      </button>

      <Dialog open={open} title={t("statusTitle")} onClose={() => setOpen(false)}>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3" data-testid="connection-details">
          <dt className="flex items-center gap-2 font-display">
            <Light link={shop} />
            {t("statusShop")}
          </dt>
          <dd>
            <span className="block">
              {t(LINK_WORDS[shop])}
              {inUse === "shop" ? ` · ${t("statusInUse")}` : ""}
            </span>
            <span className="block truncate text-sm text-ink-soft">{session.serverUrl}</span>
          </dd>
          <dt className="flex items-center gap-2 font-display">
            <Light link={cloud} />
            {t("statusCloud")}
          </dt>
          <dd>
            <span className="block">
              {t(LINK_WORDS[cloud])}
              {inUse === "cloud" ? ` · ${t("statusInUse")}` : ""}
            </span>
            {session.cloudUrl ? <span className="block truncate text-sm text-ink-soft">{session.cloudUrl}</span> : null}
          </dd>
          <dt className="font-display">{t("statusLastSync")}</dt>
          <dd>
            <span className="block">{syncLine}</span>
            <span className="block text-sm text-ink-soft">
              {servers.lastSyncedAt ? formatClock(new Date(servers.lastSyncedAt)) : t("statusNever")}
            </span>
          </dd>
        </dl>
        {session.cloudUrl ? (
          <p className="mt-5 text-sm text-ink-soft" data-testid="switch-rule">
            {t(session.cloudToken ? "statusSwitchRule" : "statusCloudNoSignIn")}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
