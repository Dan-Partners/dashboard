const LONDON = "Europe/London";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

export function formatPence(pence: number): string {
  return gbp.format(pence / 100);
}

export function parsePoundsToPence(input: string): number | null {
  const cleaned = input.trim().replace(/£/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const pence = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(pence) || pence > 100_000) return null;
  return pence;
}

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

type Zoned = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: string;
};

export function zonedParts(date: Date, timeZone = LONDON): Zoned {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday ?? "",
  };
}

export function dayKey(date: Date): string {
  const parts = zonedParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** Monday-start calendar week in Europe/London, as YYYY-MM-DD. */
export function weekStartKey(date: Date): string {
  const parts = zonedParts(date);
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  utc.setUTCDate(utc.getUTCDate() - Math.max(0, index));
  return utc.toISOString().slice(0, 10);
}

export function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatStamp(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function primaryName(nameEn: string, nameZh: string, locale: string) {
  return locale === "zh-Hant" ? nameZh : nameEn;
}

export function secondaryName(nameEn: string, nameZh: string, locale: string) {
  return locale === "zh-Hant" ? nameEn : nameZh;
}

export function inLondonRange(iso: string, range: "today" | "week", now: Date): boolean {
  const key = dayKey(new Date(iso));
  if (range === "today") return key === dayKey(now);
  return key >= weekStartKey(now) && key <= dayKey(now);
}
