import type { SyncStatus } from "./types";

/** Missed checks in a row before a server shows as offline rather than reconnecting. */
export const OFFLINE_AFTER = 3;
/** Good checks in a row before the counter goes back to the shop server. */
export const BACK_AFTER = 2;
/**
 * Good checks in a row after which the counter goes back to the shop server
 * even if it has not reported catching up with the cloud (its sync is stuck):
 * the shop server is the counter's home, and the board refreshes from it.
 */
export const BACK_ANYWAY_AFTER = 10;

export type Link = "checking" | "connected" | "reconnecting" | "offline" | "not_set";

export type ServerName = "shop" | "cloud";

/** Connected, then reconnecting for a couple of missed checks, then offline. */
export function linkFrom(misses: number, everChecked: boolean): Link {
  if (!everChecked) return "checking";
  if (misses === 0) return "connected";
  return misses < OFFLINE_AFTER ? "reconnecting" : "offline";
}

/** What the last checks of both servers found. */
export type Health = {
  /** Shop server checks missed in a row. */
  shopMisses: number;
  /** Shop server checks answered in a row. */
  shopGood: number;
  /** The cloud answered its last check. */
  cloudUp: boolean;
  /** This tablet holds a cloud sign-in (made at login). */
  cloudSignedIn: boolean;
  /** The shop server's own sync report, from its last answer. */
  sync: SyncStatus | null;
};

/** The shop server has sent and fetched everything (or does not sync at all). */
function caughtUp(sync: SyncStatus | null): boolean {
  return !sync || sync.mode !== "waiting";
}

/**
 * Which server the counter should use next.
 *
 * The shop server always, unless it has missed OFFLINE_AFTER checks in a row
 * while the cloud answers and this tablet is signed in to the cloud. Then the
 * cloud, until the shop server has answered BACK_AFTER checks in a row and
 * reports it has caught up with the cloud, so the orders taken meanwhile are on
 * it before the board switches back. If the cloud goes quiet, or the shop's
 * sync stays stuck, the counter goes back to the shop server anyway.
 */
export function serverInUse(current: ServerName, health: Health): ServerName {
  if (!health.cloudSignedIn) return "shop";
  if (current === "shop") {
    return health.shopMisses >= OFFLINE_AFTER && health.cloudUp ? "cloud" : "shop";
  }
  if (health.shopGood < BACK_AFTER) return "cloud";
  if (caughtUp(health.sync) || !health.cloudUp || health.shopGood >= BACK_ANYWAY_AFTER) return "shop";
  return "cloud";
}
