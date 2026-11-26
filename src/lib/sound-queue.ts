import { audioUnlocked, playSound } from "./sounds";
import type { Sound, SoundPlace } from "./triggers";

/*
 * One sound per ticket event, at least 400 ms apart so a rush does not
 * smear into one noise, and once per device: a tablet with two Dan tabs
 * open plays it in one of them only. Nothing loops.
 */

export const MIN_GAP_MS = 400;
const PLAYED_KEY = "dan.sounds.played";
const KEEP_MS = 10 * 60_000;

let lastAt = 0;
let chain: Promise<void> = Promise.resolve();

/** Claims an event for this device, across tabs. False: another tab has it. */
async function claim(key: string): Promise<boolean> {
  const take = () => {
    const now = Date.now();
    let played: Record<string, number> = {};
    try {
      played = JSON.parse(localStorage.getItem(PLAYED_KEY) ?? "{}") as Record<string, number>;
    } catch {
      played = {};
    }
    if (played[key]) return false;
    for (const [entry, at] of Object.entries(played)) if (now - at > KEEP_MS) delete played[entry];
    played[key] = now;
    try {
      localStorage.setItem(PLAYED_KEY, JSON.stringify(played));
    } catch {
      // Storage off: this tab plays it.
    }
    return true;
  };
  try {
    if (typeof navigator !== "undefined" && navigator.locks) return await navigator.locks.request("dan-ticket-sounds", take);
  } catch {
    // No locks: the storage check alone.
  }
  return take();
}

/** What played, for the tests and for anyone checking a station by ear. */
export type Played = { key: string; sound: Sound; place: SoundPlace; at: number };

function record(played: Played) {
  const w = window as unknown as { __danSounds?: Played[] };
  (w.__danSounds ??= []).push(played);
}

/** Queues a sound for a ticket event. */
export function queueSound(key: string, sound: Sound, place: SoundPlace) {
  chain = chain.then(async () => {
    if (!audioUnlocked() || !(await claim(key))) return;
    const wait = lastAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    if (playSound(sound)) {
      lastAt = Date.now();
      record({ key, sound, place, at: lastAt });
    }
  });
}
