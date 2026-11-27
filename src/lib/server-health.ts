"use client";

import { useEffect, useState } from "react";
import { DanError } from "./errors";
import { checkCloud, GraphQLDanClient, pingServer } from "./graphql-client";
import { linkFrom, serverInUse, type Link, type ServerName } from "./server-links";
import type { PrinterStatus, Session, SyncStatus } from "./types";

/** How often both servers are checked while all is well. */
export const CHECK_EVERY_MS = 10_000;
/**
 * How often while the shop server is missing checks or the counter is on the
 * cloud, so a switch either way happens in seconds, not half a minute.
 */
export const CHECK_SOON_MS = 3_000;

export type Servers = {
  shop: Link;
  cloud: Link;
  /** The shop server's sync report; null when it is not answering. */
  sync: SyncStatus | null;
  /** When the shop server last reported a sync, kept while it is not answering. */
  lastSyncedAt: string | null;
  /** The shop's printers, from the shop server (which prints). Empty when it is not answering. */
  printers: PrinterStatus[];
  inUse: ServerName;
  /**
   * The shop server's shop lives in the Dan cloud (DAN-34): its settings are
   * the cloud's, saved there while the machine is connected. Kept while the
   * shop server is not answering.
   */
  settingsInCloud: boolean;
};

const STARTING: Servers = { shop: "checking", cloud: "checking", sync: null, lastSyncedAt: null, printers: [], inUse: "shop", settingsInCloud: false };

/** A shop server from DAN-34 on, with a key: its sync report says whether it is connected. */
export function settingsInCloudFrom(sync: SyncStatus | null): boolean {
  return Boolean(sync && typeof sync.connected === "boolean" && sync.mode !== "not_running");
}

/** The server in use, readable outside React (requests read it when sent). */
let inUseNow: ServerName = "shop";
/** What the last check said about the shop's settings, readable outside React too. */
let settingsNow: Pick<Servers, "settingsInCloud" | "sync"> = { settingsInCloud: false, sync: null };

export type Endpoint = { url: string; token: string; server: ServerName };

/** Where a request goes right now: the shop server, or the cloud while it stands in. */
export function endpointFor(session: Session | null | undefined): Endpoint | null {
  if (session?.mode !== "remote") return null;
  if (inUseNow === "cloud" && session.cloudUrl && session.cloudToken) {
    return { url: session.cloudUrl, token: session.cloudToken, server: "cloud" };
  }
  if (!session.serverUrl || !session.token) return null;
  return { url: session.serverUrl, token: session.token, server: "shop" };
}

/**
 * Whether the owner's settings can be changed now, and where they are saved
 * (RK, 27 Nov 2026, DAN-34: the cloud is where a shop's settings live, the
 * machine is where its orders live).
 *
 * - `here`: on the server in use. A shop server without a key, a shop that
 *   lives in the cloud, or the cloud standing in for the machine.
 * - `cloud`: a shop server whose shop lives in the cloud, connected to it.
 *   Saved to the cloud; the machine takes the change on its next round.
 * - `offline`: that machine is not connected to the cloud. Read only.
 * - `key_refused`: the cloud no longer accepts the machine's key. Read only.
 * - `sign_in_again`: connected, but this tablet signed in before the machine
 *   first reached the cloud, so it has no cloud sign-in yet.
 */
export type SettingsAccess = "here" | "cloud" | "offline" | "key_refused" | "sign_in_again";

export function settingsAccess(session: Session | null | undefined, servers: Pick<Servers, "inUse" | "settingsInCloud" | "sync">): SettingsAccess {
  if (session?.mode !== "remote" || session.home === "cloud") return "here";
  if (servers.inUse === "cloud" || !servers.settingsInCloud) return "here";
  if (servers.sync?.mode === "key_refused") return "key_refused";
  if (!servers.sync?.connected) return "offline";
  if (!session.cloudUrl || !session.cloudToken) return "sign_in_again";
  return "cloud";
}

/** The copy key saying why settings cannot be changed now, for each refusal. */
export const SETTINGS_REFUSAL = {
  offline: "settings_offline",
  key_refused: "key_refused",
  sign_in_again: "settings_sign_in_again",
} as const;

/**
 * Where an owner's setting is saved right now (see `settingsAccess`). Throws
 * a DanError when it cannot be saved anywhere now. Null when not signed in.
 */
export function settingsEndpointFor(session: Session | null | undefined): Endpoint | null {
  const access = settingsAccess(session, { inUse: inUseNow, ...settingsNow });
  if (access === "here") return endpointFor(session);
  if (access === "cloud") return { url: session!.cloudUrl!, token: session!.cloudToken!, server: "cloud" };
  const messages = {
    offline: "The shop's settings are changed in the Dan cloud, and the shop server is not connected to it.",
    key_refused: "The Dan cloud no longer accepts this shop server's key. Settings cannot be changed until Dan sorts it out.",
    sign_in_again: "Sign out and sign in again to change the shop's settings.",
  };
  throw new DanError(SETTINGS_REFUSAL[access], messages[access]);
}

/**
 * Checks both servers and decides which one the counter uses (see
 * `serverInUse`). Starts on the shop server whenever the session changes.
 */
export function useServerHealth(session: Session | null): Servers {
  const [servers, setServers] = useState<Servers>(STARTING);
  const remote = session?.mode === "remote";
  const serverUrl = session?.serverUrl ?? null;
  const token = session?.token ?? null;
  const cloudUrl = session?.cloudUrl ?? null;
  const cloudToken = session?.cloudToken ?? null;
  /** The shop lives in the cloud: one server, checked once, and nothing to sync with. */
  const cloudHome = session?.home === "cloud";

  useEffect(() => {
    if (!remote || !serverUrl) return;
    let cancelled = false;
    let timer = 0;
    let shopMisses = 0;
    let shopGood = 0;
    let cloudMisses = 0;
    let inUse: ServerName = "shop";
    let lastSyncedAt: string | null = null;
    let settingsInCloud = false;

    const check = async () => {
      const [shopUp, cloudChecked] = await Promise.all([
        pingServer(serverUrl).then(
          () => true,
          () => false,
        ),
        cloudUrl && !cloudHome ? checkCloud(cloudUrl) : Promise.resolve(false),
      ]);
      const cloudUp = cloudHome ? shopUp : cloudChecked;
      // An older shop server has no sync report: treated as nothing to wait for.
      const shopClient = shopUp && token && !cloudHome ? new GraphQLDanClient(serverUrl, token) : null;
      const [sync, printers] = shopClient
        ? await Promise.all([
            shopClient.getSyncStatus().catch(() => null),
            // A shop server from before printing has no print status: none to show.
            shopClient.getPrintStatus().catch(() => []),
          ])
        : [null, []];
      if (cancelled) return;
      shopMisses = shopUp ? 0 : shopMisses + 1;
      shopGood = shopUp ? shopGood + 1 : 0;
      cloudMisses = cloudUp ? 0 : cloudMisses + 1;
      if (sync?.lastSyncedAt) lastSyncedAt = sync.lastSyncedAt;
      if (sync) settingsInCloud = settingsInCloudFrom(sync);
      // With one server there is nothing to switch to.
      inUse = cloudHome
        ? "shop"
        : serverInUse(inUse, {
            shopMisses,
            shopGood,
            cloudUp,
            cloudSignedIn: Boolean(cloudUrl && cloudToken),
            sync,
          });
      // Set before React hears of it, so the reconnection it triggers already
      // sends its requests to the new server.
      inUseNow = inUse;
      settingsNow = { settingsInCloud, sync };
      setServers({
        shop: linkFrom(shopMisses, true),
        cloud: cloudUrl ? linkFrom(cloudMisses, true) : "not_set",
        sync,
        lastSyncedAt,
        printers,
        inUse,
        settingsInCloud,
      });
      // Sooner while something is wrong, a printer included, so a fix shows quickly.
      const soon = shopMisses > 0 || inUse === "cloud" || printers.some((printer) => printer.failing);
      timer = window.setTimeout(() => void check(), soon ? CHECK_SOON_MS : CHECK_EVERY_MS);
    };
    void check();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      inUseNow = "shop";
      settingsNow = { settingsInCloud: false, sync: null };
      setServers(STARTING);
    };
  }, [remote, serverUrl, token, cloudUrl, cloudToken, cloudHome]);

  return servers;
}
