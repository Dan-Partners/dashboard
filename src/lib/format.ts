const LONDON = "Europe/London";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

/**
 * An order's number as staff see it. 0 means placed through the Dan cloud and
 * not numbered yet: the shop server gives it one within seconds.
 */
export function orderLabel(number: number, waiting = "…"): string {
  return number > 0 ? `#${number}` : waiting;
}

type FulfilmentKey = "fulfilCollection" | "fulfilDelivery" | "fulfilEatIn" | "table" | "deliveryShop" | "deliveryUber";

/** "Collection", "Delivery · Uber Direct", or "Eat in · Table 3" for an order brought to a table. */
export function fulfilmentLabel(
  order: { fulfilment: string; table?: string | null; deliveryBy?: string | null },
  t: (key: FulfilmentKey) => string,
): string {
  if (order.fulfilment === "eat_in") return order.table ? `${t("fulfilEatIn")} · ${t("table")} ${order.table}` : t("fulfilEatIn");
  if (order.fulfilment === "delivery") {
    if (order.deliveryBy === "uber_direct") return `${t("fulfilDelivery")} · ${t("deliveryUber")}`;
    if (order.deliveryBy === "shop") return `${t("fulfilDelivery")} · ${t("deliveryShop")}`;
    return t("fulfilDelivery");
  }
  return t("fulfilCollection");
}

type PaymentKey = "paymentPaidCard" | "paymentPaidBank" | "paymentDueShop" | "paymentCashOnDelivery" | "paidShort";

/**
 * How an order is paid, as the docket says it: paid by card or by bank
 * transfer, or the amount still to take (at the shop, or cash on delivery).
 */
export function paymentLabel(
  order: { payment?: { method: string; status: string } | null; fulfilment: string; totalPence: number },
  t: (key: PaymentKey) => string,
): { text: string; paid: boolean } | null {
  if (!order.payment) return null;
  if (order.payment.status === "paid") {
    const key = order.payment.method === "bank_transfer" ? "paymentPaidBank" : order.payment.method === "card" ? "paymentPaidCard" : "paidShort";
    return { text: t(key), paid: true };
  }
  const due = order.fulfilment === "delivery" ? t("paymentCashOnDelivery") : t("paymentDueShop");
  return { text: `${due} · ${formatPence(order.totalPence)}`, paid: false };
}

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
  return (locale === "zh-Hant" ? nameZh : nameEn) || nameEn || nameZh;
}

/** The name in the other language. Empty when there is only one name. */
export function secondaryName(nameEn: string, nameZh: string, locale: string) {
  if (nameEn === nameZh) return "";
  return locale === "zh-Hant" ? nameEn : nameZh;
}

export function inLondonRange(iso: string, range: "today" | "week", now: Date): boolean {
  const key = dayKey(new Date(iso));
  if (range === "today") return key === dayKey(now);
  return key >= weekStartKey(now) && key <= dayKey(now);
}

/** How long ago, short: "just now", "4m", "2h", "1d" (or 分 / 小時 / 日). */
export function ago(iso: string, now: number, locale: string, justNow: string) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return justNow;
  if (mins < 60) return locale === "zh-Hant" ? `${mins} 分` : `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return locale === "zh-Hant" ? `${hours} 小時` : `${hours}h`;
  const days = Math.round(hours / 24);
  return locale === "zh-Hant" ? `${days} 日` : `${days}d`;
}
