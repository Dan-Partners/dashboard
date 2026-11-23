"use client";

import { useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, subscribe, writePersisted } from "./storage";
import { THEME_CACHE_KEY, normalizeTheme, resolveTheme, serializeResolved, specOf, type ThemeChoice } from "./theme";

let appliedChoice: ThemeChoice | null = null;

/** Paints the theme on <html> and caches it for the next page load. */
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  // React can reset <html> attributes on a development remount, so check the DOM too.
  if (choice === appliedChoice && root.style.getPropertyValue("--dan-paper")) return;
  const resolved = resolveTheme(specOf(choice));
  for (const [name, value] of Object.entries(resolved.vars)) root.style.setProperty(name, value);
  root.style.colorScheme = resolved.scheme;
  root.dataset.theme = choice.preset;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved.page.paper);
  try {
    window.localStorage.setItem(THEME_CACHE_KEY, serializeResolved(resolved));
  } catch {
    // Private mode or a full disk. The theme still applies for this visit.
  }
  appliedChoice = choice;
}

export function useTheme() {
  const persisted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setTheme = (next: ThemeChoice) => writePersisted({ theme: normalizeTheme(next) });
  return { theme: persisted.theme, setTheme };
}
