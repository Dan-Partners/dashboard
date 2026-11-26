import { DanError } from "./errors";
import type { MenuItem, Station } from "./types";

export const MAX_STATIONS = 12;
export const MAX_STATION_NAME = 24;

export function stationOf(stations: Station[], id: string): Station | undefined {
  return stations.find((station) => station.id === id);
}

/** A station's name in the reader's language. One that has gone shows its id; none shows nothing. */
export function stationName(stations: Station[], id: string, locale: string): string {
  if (!id) return "";
  const station = stationOf(stations, id);
  if (!station) return id;
  return (locale === "zh-Hant" ? station.nameZh : station.nameEn) || station.nameEn || station.nameZh;
}

/** Its name in the other language. Empty when it has one name, or has gone. */
export function stationGloss(stations: Station[], id: string, locale: string): string {
  const station = stationOf(stations, id);
  if (!station || station.nameEn === station.nameZh || !station.nameEn || !station.nameZh) return "";
  return locale === "zh-Hant" ? station.nameEn : station.nameZh;
}

/** The station a new dish starts on: the counter where the shop has one, else the first, else none. */
export function defaultStation(stations: Station[]): string {
  return stationOf(stations, "counter")?.id ?? stations[0]?.id ?? "";
}

/** A new station's id, from its name: lowercase letters, digits and hyphens, and not one already used. */
export function newStationId(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24)
      .replace(/-+$/g, "") || "station";
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 100; n += 1) if (!taken.includes(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now().toString(36)}`;
}

/** The server's checks, with its codes. Returns the list tidied. */
export function checkStations(list: Station[]): Station[] {
  if (list.length > MAX_STATIONS) throw new DanError("stations_size", `Up to ${MAX_STATIONS} stations.`);
  const seen = new Set<string>();
  return list.map((station) => {
    const id = station.id.trim();
    if (!/^[a-z0-9_-]{1,32}$/.test(id) || seen.has(id)) throw new DanError("stations_ids", "Each station needs its own id.");
    seen.add(id);
    const en = station.nameEn.trim();
    const zh = station.nameZh.trim();
    if (!en && !zh) throw new DanError("stations_name", "Each station needs a name.");
    const nameEn = en || zh;
    const nameZh = zh || en;
    if ([...nameEn].length > MAX_STATION_NAME || [...nameZh].length > MAX_STATION_NAME) {
      throw new DanError("stations_name", `A station's name is up to ${MAX_STATION_NAME} characters.`);
    }
    return { id, nameEn, nameZh };
  });
}

/** A saved list that cannot be read is treated as not there. */
export function normalizeStations(value: unknown, fallback: Station[]): Station[] {
  if (!Array.isArray(value)) return fallback;
  try {
    return checkStations(value as Station[]);
  } catch {
    return fallback;
  }
}

/** How many dishes are made at each station. */
export function dishesByStation(items: Pick<MenuItem, "station">[]): Map<string, number> {
  const count = new Map<string, number>();
  for (const item of items) count.set(item.station, (count.get(item.station) ?? 0) + 1);
  return count;
}

/** Refuses a list that drops a station dishes still use, as the server does. */
export function checkRemovals(current: Station[], next: Station[], items: Pick<MenuItem, "station">[]) {
  const dishes = dishesByStation(items);
  for (const gone of current.filter((station) => !next.some((kept) => kept.id === station.id))) {
    const count = dishes.get(gone.id) ?? 0;
    if (count > 0) {
      throw new DanError(
        "station_in_use",
        `${gone.nameEn} is still on ${count} ${count === 1 ? "dish" : "dishes"}. Move ${count === 1 ? "it" : "them"} to another station first.`,
      );
    }
  }
}
