import type { SoundPlace } from "./triggers";
import type { DemoState } from "./seed";
import { DEFAULT_THEME, normalizeTheme, type ThemeChoice } from "./theme";
import { normalizeFocus, normalizeStations, type Focus } from "./focus";
import type { Session } from "./types";

export type Locale = "en" | "zh-Hant";

export type Persisted = {
  version: 1;
  session: Session | null;
  recentServers: string[];
  /** The Dan cloud address last used on this device, to fill the sign-in page. */
  lastCloudUrl: string | null;
  /** The shop's address name last signed in to through the cloud, to fill the counter PIN form. */
  lastShopName: string | null;
  /** How this device last signed in: through the Dan cloud, or to a shop server by its address. */
  lastWay: "cloud" | "server" | null;
  locale: Locale;
  demoState: DemoState | null;
  activeOrderId: string | null;
  /** Saved on this device only. A shop-wide theme would need the shop server. */
  theme: ThemeChoice;
  /** Focus mode: this tablet locked to one position. */
  focus: Focus | null;
  /** The kitchen screen's station filter on this tablet: station ids. Empty: all. */
  kitchenStations: string[];
  /** The ordering site address the Tools page last used for table QR codes. */
  orderingAddress: string | null;
  /** Ticket sounds wanted on this device, per station (kitchen, pass, counter). */
  sounds: Partial<Record<SoundPlace, boolean>>;
};

export const STORAGE_KEY = "dan.v1";

export const EMPTY_PERSISTED: Persisted = {
  version: 1,
  session: null,
  recentServers: [],
  lastCloudUrl: null,
  lastShopName: null,
  lastWay: null,
  locale: "en",
  demoState: null,
  activeOrderId: null,
  theme: DEFAULT_THEME,
  focus: null,
  kitchenStations: [],
  orderingAddress: null,
  sounds: {},
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
    lastShopName: typeof record.lastShopName === "string" && record.lastShopName.length <= 40 ? record.lastShopName : null,
    lastWay: record.lastWay === "cloud" || record.lastWay === "server" ? record.lastWay : null,
    locale: isLocale(record.locale) ? record.locale : "en",
    demoState: demo,
    activeOrderId: typeof record.activeOrderId === "string" ? record.activeOrderId : null,
    theme: normalizeTheme(record.theme),
    focus: normalizeFocus(record.focus),
    kitchenStations: normalizeStations(record.kitchenStations),
    orderingAddress: typeof record.orderingAddress === "string" && record.orderingAddress.length <= 200 ? record.orderingAddress : null,
    sounds: normalizeSounds(record.sounds),
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

let followingTabs = false;

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab on this device saved: follow it (the demo, preferences, sign-in).
  if (!followingTabs && typeof window !== "undefined") {
    followingTabs = true;
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY) return;
      cache = read();
      emit();
    });
  }
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

function normalizeSounds(value: unknown): Partial<Record<SoundPlace, boolean>> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const sounds: Partial<Record<SoundPlace, boolean>> = {};
  for (const place of ["kitchen", "pass", "counter"] as const) {
    if (typeof record[place] === "boolean") sounds[place] = record[place] as boolean;
  }
  return sounds;
}
