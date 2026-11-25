import type { DemoState } from "./seed";
import { DEFAULT_THEME, normalizeTheme, type ThemeChoice } from "./theme";
import { normalizeFocus, normalizeStations, type Focus } from "./focus";
import { STATIONS, type Session, type Station } from "./types";

export type Locale = "en" | "zh-Hant";

export type Persisted = {
  version: 1;
  session: Session | null;
  recentServers: string[];
  /** The Dan cloud address last used on this device, to fill the sign-in page. */
  lastCloudUrl: string | null;
  locale: Locale;
  demoState: DemoState | null;
  activeOrderId: string | null;
  /** Saved on this device only. A shop-wide theme would need the shop server. */
  theme: ThemeChoice;
  /** Focus mode: this tablet locked to one position. */
  focus: Focus | null;
  /** The kitchen screen's station filter on this tablet. */
  kitchenStations: Station[];
};

export const STORAGE_KEY = "dan.v1";

export const EMPTY_PERSISTED: Persisted = {
  version: 1,
  session: null,
  recentServers: [],
  lastCloudUrl: null,
  locale: "en",
  demoState: null,
  activeOrderId: null,
  theme: DEFAULT_THEME,
  focus: null,
  kitchenStations: [...STATIONS],
};

const listeners = new Set<() => void>();
let cache: Persisted | null = null;

function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh-Hant";
}

export function normalizePersisted(value: unknown): Persisted {
  if (!value || typeof value !== "object") return EMPTY_PERSISTED;
  const record = value as Partial<Persisted>;
  const demo =
    record.demoState && record.demoState.version === 1 && Array.isArray(record.demoState.items)
      ? record.demoState
      : null;
  return {
    version: 1,
    session: record.session?.shop && record.session.staff ? record.session : null,
    recentServers: Array.isArray(record.recentServers)
      ? record.recentServers.filter((entry): entry is string => typeof entry === "string").slice(0, 5)
      : [],
    lastCloudUrl: typeof record.lastCloudUrl === "string" ? record.lastCloudUrl : null,
    locale: isLocale(record.locale) ? record.locale : "en",
    demoState: demo,
    activeOrderId: typeof record.activeOrderId === "string" ? record.activeOrderId : null,
    theme: normalizeTheme(record.theme),
    focus: normalizeFocus(record.focus),
    kitchenStations: normalizeStations(record.kitchenStations),
  };
}

function read(): Persisted {
  if (typeof window === "undefined") return EMPTY_PERSISTED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_PERSISTED;
    return normalizePersisted(JSON.parse(raw) as unknown);
  } catch {
    return EMPTY_PERSISTED;
  }
}

export function getSnapshot(): Persisted {
  if (typeof window === "undefined") return EMPTY_PERSISTED;
  if (!cache) cache = read();
  return cache;
}

export function getServerSnapshot(): Persisted {
  return EMPTY_PERSISTED;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

export function writePersisted(patch: Partial<Persisted>) {
  const next: Persisted = { ...getSnapshot(), ...patch, version: 1 };
  cache = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  emit();
}

export function rememberServer(url: string) {
  const recentServers = [url, ...getSnapshot().recentServers.filter((entry) => entry !== url)].slice(0, 5);
  writePersisted({ recentServers });
}

export function forgetServer(url: string) {
  writePersisted({ recentServers: getSnapshot().recentServers.filter((entry) => entry !== url) });
}
