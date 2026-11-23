"use client";

import { useLayoutEffect } from "react";
import { getSnapshot, subscribe } from "@/lib/storage";
import { applyTheme } from "@/lib/use-theme";

/**
 * Keeps <html> painted in the saved theme. The inline script in the root
 * layout handles the first paint; this takes over once React is running and
 * follows every later change.
 */
export function ThemeSync() {
  useLayoutEffect(() => {
    const sync = () => applyTheme(getSnapshot().theme);
    sync();
    return subscribe(sync);
  }, []);
  return null;
}
