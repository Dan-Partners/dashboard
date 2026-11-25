"use client";

import { useEffect, useState } from "react";
import { formatClock } from "@/lib/format";
import { checkCloud, GraphQLDanClient, pingServer } from "@/lib/graphql-client";
import { useI18n, type CopyKey } from "@/lib/i18n";
import { linkFrom, type Link } from "@/lib/server-links";
import type { Session, SyncStatus } from "@/lib/types";
import { Dialog } from "./ui";

/** How often both servers are checked. */
const CHECK_EVERY_MS = 10_000;
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

type Checked = { misses: number; checked: boolean };

function useServers(session: Session) {
  const [shopLink, setShop] = useState<Checked>({ misses: 0, checked: false });
  const [cloudLink, setCloud] = useState<Checked>({ misses: 0, checked: false });
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const { serverUrl, token, cloudUrl } = session;
  const remote = session.mode === "remote";

  useEffect(() => {
    if (!remote || !serverUrl) return;
    let cancelled = false;
    const check = async () => {
      const [shopUp, cloudUp] = await Promise.all([
        pingServer(serverUrl).then(
          () => true,
          () => false,
        ),
        cloudUrl ? checkCloud(cloudUrl) : Promise.resolve(false),
      ]);
      if (cancelled) return;
      setShop((last) => ({ misses: shopUp ? 0 : last.misses + 1, checked: true }));
      setCloud((last) => ({ misses: cloudUp ? 0 : last.misses + 1, checked: true }));
      if (shopUp && token) {
        new GraphQLDanClient(serverUrl, token)
          .getSyncStatus()
          .then((next) => {
            if (!cancelled) setSync(next);
          })
          // An older shop server has no sync status. Show none rather than guess.
          .catch(() => undefined);
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [remote, serverUrl, token, cloudUrl]);

  return {
    shop: linkFrom(shopLink.misses, shopLink.checked),
    cloud: cloudUrl ? linkFrom(cloudLink.misses, cloudLink.checked) : ("not_set" as Link),
    sync,
  };
}

function Light({ link }: { link: Link }) {
  return <span aria-hidden className={`inline-block size-2.5 shrink-0 rounded-full ${LIGHT[link]}`} />;
}

/**
 * The top right of every screen: is the shop server there, is the cloud there,
 * which one the counter is using, and whether changes have reached the cloud.
 * Tap for the addresses and the last sync.
 */
export function ConnectionStatus({ session }: { session: Session }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { shop, cloud, sync } = useServers(session);

  if (session.mode === "demo") {
    return (
      <p className="font-display text-sm tracking-[0.14em] text-ink-soft uppercase" data-testid="connection-status">
        {t("statusDemo")}
      </p>
    );
  }

  // The shop server is always the counter's first choice. The cloud takes over
  // only once it can run shops (not built yet), so for now the shop is in use.
  const inUse = "shop";
  const syncLine =
    !sync || sync.mode === "not_running"
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
      >
        <span className="flex items-center gap-3 font-display text-sm tracking-[0.12em] uppercase">
          <span className={`flex items-center gap-1.5 ${inUse === "shop" ? "text-ink underline decoration-2 underline-offset-4" : "text-ink-soft"}`}>
            <Light link={shop} />
            {t("statusShop")}
          </span>
          <span className="flex items-center gap-1.5 text-ink-soft">
            <Light link={cloud} />
            {t("statusCloud")}
          </span>
        </span>
        <span className="text-xs text-ink-soft" data-testid="sync-line">
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
            <span className="block">{t(LINK_WORDS[cloud])}</span>
            {session.cloudUrl ? <span className="block truncate text-sm text-ink-soft">{session.cloudUrl}</span> : null}
          </dd>
          <dt className="font-display">{t("statusLastSync")}</dt>
          <dd>
            <span className="block">{syncLine}</span>
            <span className="block text-sm text-ink-soft">
              {sync?.lastSyncedAt ? formatClock(new Date(sync.lastSyncedAt)) : t("statusNever")}
            </span>
          </dd>
        </dl>
        {session.cloudUrl ? <p className="mt-5 text-sm text-ink-soft">{t("statusCloudLater")}</p> : null}
      </Dialog>
    </>
  );
}
