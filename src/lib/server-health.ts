"use client";

import { useEffect, useState } from "react";
import { checkCloud, GraphQLDanClient, pingServer } from "./graphql-client";
import { linkFrom, serverInUse, type Link, type ServerName } from "./server-links";
import type { Session, SyncStatus } from "./types";

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
  inUse: ServerName;
};

const STARTING: Servers = { shop: "checking", cloud: "checking", sync: null, lastSyncedAt: null, inUse: "shop" };

/** The server in use, readable outside React (requests read it when sent). */
let inUseNow: ServerName = "shop";

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

  useEffect(() => {
    if (!remote || !serverUrl) return;
    let cancelled = false;
    let timer = 0;
    let shopMisses = 0;
    let shopGood = 0;
    let cloudMisses = 0;
    let inUse: ServerName = "shop";
    let lastSyncedAt: string | null = null;

    const check = async () => {
      const [shopUp, cloudUp] = await Promise.all([
        pingServer(serverUrl).then(
          () => true,
          () => false,
        ),
        cloudUrl ? checkCloud(cloudUrl) : Promise.resolve(false),
      ]);
      // An older shop server has no sync report: treated as nothing to wait for.
      const sync =
        shopUp && token
          ? await new GraphQLDanClient(serverUrl, token).getSyncStatus().catch(() => null)
          : null;
      if (cancelled) return;
      shopMisses = shopUp ? 0 : shopMisses + 1;
      shopGood = shopUp ? shopGood + 1 : 0;
      cloudMisses = cloudUp ? 0 : cloudMisses + 1;
      if (sync?.lastSyncedAt) lastSyncedAt = sync.lastSyncedAt;
      inUse = serverInUse(inUse, {
        shopMisses,
        shopGood,
        cloudUp,
        cloudSignedIn: Boolean(cloudUrl && cloudToken),
        sync,
      });
      // Set before React hears of it, so the reconnection it triggers already
      // sends its requests to the new server.
      inUseNow = inUse;
      setServers({
        shop: linkFrom(shopMisses, true),
        cloud: cloudUrl ? linkFrom(cloudMisses, true) : "not_set",
        sync,
        lastSyncedAt,
        inUse,
      });
      timer = window.setTimeout(() => void check(), shopMisses > 0 || inUse === "cloud" ? CHECK_SOON_MS : CHECK_EVERY_MS);
    };
    void check();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      inUseNow = "shop";
      setServers(STARTING);
    };
  }, [remote, serverUrl, token, cloudUrl, cloudToken]);

  return servers;
}
