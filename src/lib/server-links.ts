/** Missed checks in a row before a server shows as offline rather than reconnecting. */
export const OFFLINE_AFTER = 3;

export type Link = "checking" | "connected" | "reconnecting" | "offline" | "not_set";

/** Connected, then reconnecting for a couple of missed checks, then offline. */
export function linkFrom(misses: number, everChecked: boolean): Link {
  if (!everChecked) return "checking";
  if (misses === 0) return "connected";
  return misses < OFFLINE_AFTER ? "reconnecting" : "offline";
}
