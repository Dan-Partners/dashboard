"use client";

import { useSyncExternalStore } from "react";
import { GraphQLDanClient } from "./graphql-client";
import { getServerSnapshot, getSnapshot, subscribe, writePersisted } from "./storage";
import { THEME_CACHE_KEY, normalizeTheme, resolveTheme, serializeResolved, specOf, type ThemeChoice } from "./theme";
import type { Session } from "./types";

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
  root.dataset.typeface = choice.typeface;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", resolved.page.paper);
  try {
    window.localStorage.setItem(THEME_CACHE_KEY, serializeResolved(resolved, choice.typeface));
  } catch {
    // Private mode or a full disk. The theme still applies for this visit.
  }
  appliedChoice = choice;
}

/*
 * The theme belongs to the shop and lives on the shop server. This browser
 * keeps a copy (in dan.v1) so the page paints in it before it connects, and
 * so an owner's edit shows at once. The edit is saved to the server half a
 * second after the last change, so dragging a colour picker sends one save,
 * not hundreds. The demo has no server, so its theme stays in the browser.
 */

export type ThemeSave = { saving: boolean; failed: boolean };
const IDLE: ThemeSave = { saving: false, failed: false };
let save: ThemeSave = IDLE;
const saveListeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let lastLocalEdit = 0;

function setSave(next: ThemeSave) {
  save = next;
  for (const listener of saveListeners) listener();
}

function subscribeSave(listener: () => void) {
  saveListeners.add(listener);
  return () => saveListeners.delete(listener);
}

/** True just after a local edit, so a background refresh does not undo it. */
export function editingThemeNow(): boolean {
  return save.saving || Date.now() - lastLocalEdit < 4000;
}

/** The demo's owner and a signed-in owner can change the shop's theme. The counter PIN cannot. */
export function canEditTheme(session: Session | null): boolean {
  return session?.mode === "demo" || (session?.mode === "remote" && session.staff.role === "owner");
}

function saveToServer(session: Session, theme: ThemeChoice) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (!session.serverUrl || !session.token) return;
    setSave({ saving: true, failed: false });
    new GraphQLDanClient(session.serverUrl, session.token)
      .updateTheme(theme)
      .then((saved) => {
        writePersisted({ theme: saved });
        setSave(IDLE);
      })
      .catch(() => setSave({ saving: false, failed: true }));
  }, 500);
}

export function useTheme() {
  const persisted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const saveState = useSyncExternalStore(subscribeSave, () => save, () => IDLE);
  const session = persisted.session;
  const canEdit = canEditTheme(session);
  const setTheme = (next: ThemeChoice) => {
    if (!canEdit || !session) return;
    const theme = normalizeTheme(next);
    lastLocalEdit = Date.now();
    writePersisted({ theme });
    if (session.mode === "remote") saveToServer(session, theme);
  };
  return { theme: persisted.theme, setTheme, canEdit, save: saveState };
}
