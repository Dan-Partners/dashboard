import { useState } from "react";

/** How long a screen ignores action taps after one, so a double tap counts once. */
export const TAP_GUARD_MS = 700;

export type TapGuard = {
  /** Runs the action unless another ran in the last moment; returns null when ignored. */
  run<T>(action: () => Promise<T>): Promise<T> | null;
};

/**
 * One per screen. After a tap on Start, the Ready button appears in the same
 * place; after Served, the next ticket slides under the finger. The quiet
 * moment starts at the tap and starts again when the change lands, so the
 * second tap of a double tap is dropped however quick the server is.
 */
export function createTapGuard(now: () => number = Date.now, ms: number = TAP_GUARD_MS): TapGuard {
  let quietUntil = 0;
  return {
    run(action) {
      if (now() < quietUntil) return null;
      quietUntil = now() + ms;
      return action().finally(() => {
        quietUntil = Math.max(quietUntil, now() + ms);
      });
    },
  };
}

export function useTapGuard(): TapGuard {
  const [guard] = useState(() => createTapGuard());
  return guard;
}
