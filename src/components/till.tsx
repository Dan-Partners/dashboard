"use client";

import Link from "next/link";
import { useEffect, useReducer, useState } from "react";
import { isDanError } from "@/lib/errors";
import { formatPence, primaryName, secondaryName } from "@/lib/format";
import { messageForError, useI18n } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import type { MenuItem } from "@/lib/types";
import { Button, PageTitle } from "./ui";

type Entry = { phase: "dish" | "qty"; qty: number; digits: string };
type Draft = { number: number; nameEn: string; nameZh: string; qty: number; unitPricePence: number };

function entryReducer(state: Entry, action: "digit" | "back" | "clear" | "times" | string): Entry {
  if (action === "clear") return { phase: "dish", qty: 1, digits: "" };
  if (action === "back") {
    if (state.digits) return { ...state, digits: state.digits.slice(0, -1) };
    if (state.phase === "qty") return { phase: "dish", qty: 1, digits: String(state.qty) };
    return state;
  }
  if (action === "times") {
    const qty = Number(state.digits);
    if (state.phase === "dish" && qty >= 1 && qty <= 20) return { phase: "qty", qty, digits: "" };
    return state;
  }
  if (/^\d$/.test(action) && state.digits.length < 3) return { ...state, digits: state.digits + action };
  return state;
}

export function Till() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const items = shop.snapshot?.items ?? [];
  const [entry, dispatch] = useReducer(entryReducer, { phase: "dish", qty: 1, digits: "" });
  const [lines, setLines] = useState<Draft[]>([]);
  const [fulfilment, setFulfilment] = useState<"collection" | "delivery">("collection");
  const [source, setSource] = useState<"counter" | "phone">("counter");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ id: string; number: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const exact = items.find((item) => String(item.number) === entry.digits);

  function addDish() {
    setError(null);
    if (!entry.digits) return;
    const item = items.find((candidate) => String(candidate.number) === entry.digits);
    if (!item) {
      setError(t("tillUnknown"));
      return;
    }
    if (item.soldOut) {
      setError(`${item.number} ${primaryName(item.nameEn, item.nameZh, locale)} · ${t("tillSoldOut")}`);
      return;
    }
    const qty = entry.phase === "qty" ? entry.qty : 1;
    setLines((current) => {
      const existing = current.find((line) => line.number === item.number);
      if (existing) {
        return current.map((line) =>
          line.number === item.number ? { ...line, qty: Math.min(99, line.qty + qty) } : line,
        );
      }
      return [
        ...current,
        { number: item.number, nameEn: item.nameEn, nameZh: item.nameZh, qty, unitPricePence: item.pricePence },
      ];
    });
    dispatch("clear");
    setSent(null);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        dispatch(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        dispatch("back");
      } else if (event.key === "Escape") {
        event.preventDefault();
        dispatch("clear");
      } else if (event.key === "*") {
        event.preventDefault();
        dispatch("times");
      } else if (event.key === "Enter") {
        event.preventDefault();
        addDish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const total = lines.reduce((sum, line) => sum + line.qty * line.unitPricePence, 0);
  const display =
    entry.phase === "qty" ? `${entry.qty} × ${entry.digits || "—"}` : entry.digits || "—";

  async function send() {
    if (!lines.length) {
      setError(t("tillNeedLines"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const order = await shop.placeOrder({
        source,
        fulfilment,
        phone,
        customerName: name,
        address: fulfilment === "delivery" ? address : "",
        notes,
        lines: lines.map((line) => ({ number: line.number, qty: line.qty })),
      });
      setLines([]);
      setNotes("");
      setSent({ id: order.id, number: order.number });
    } catch (caught) {
      const code = isDanError(caught) ? caught.code : undefined;
      setError(messageForError(code, t, caught instanceof Error ? caught.message : undefined));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageTitle title={t("tillTitle")} gloss={locale === "zh-Hant" ? "Till" : "收銀"} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="border border-rule bg-paper-raised p-4">
          <div className="flex flex-wrap gap-2">
            <Toggle pressed={source === "counter"} onClick={() => setSource("counter")} label={t("tillCounter")} />
            <Toggle pressed={source === "phone"} onClick={() => setSource("phone")} label={t("tillPhoneOrder")} />
            <Toggle pressed={fulfilment === "collection"} onClick={() => setFulfilment("collection")} label={t("fulfilCollection")} />
            <Toggle pressed={fulfilment === "delivery"} onClick={() => setFulfilment("delivery")} label={t("fulfilDelivery")} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label={t("tillPhone")} value={phone} onChange={setPhone} inputMode="tel" />
            <Field label={t("tillName")} value={name} onChange={setName} />
            {fulfilment === "delivery" ? (
              <div className="sm:col-span-2">
                <Field label={t("tillAddress")} value={address} onChange={setAddress} />
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <Field label={t("tillNotes")} value={notes} onChange={setNotes} />
            </div>
          </div>
          <ul className="mt-5 divide-y divide-rule border-y border-rule">
            {lines.length === 0 ? <li className="py-4 text-ink-soft">{t("tillEmpty")}</li> : null}
            {lines.map((line) => (
              <li key={line.number} className="flex items-center gap-3 py-3">
                <span className="w-10 font-display text-xl text-vermilion">{line.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block">{primaryName(line.nameEn, line.nameZh, locale)}</span>
                  <span className="font-zh text-sm text-ink-soft">{secondaryName(line.nameEn, line.nameZh, locale)}</span>
                </span>
                <span className="flex items-center gap-1">
                  <IconButton label="−" onClick={() => changeQty(line.number, -1)} />
                  <span className="w-6 text-center font-display">{line.qty}</span>
                  <IconButton label="+" onClick={() => changeQty(line.number, 1)} />
                </span>
                <span className="w-16 text-right font-display">{formatPence(line.qty * line.unitPricePence)}</span>
                <button type="button" className="min-h-11 cursor-pointer px-1 text-sm text-ink-soft" onClick={() => setLines((current) => current.filter((entryLine) => entryLine.number !== line.number))}>
                  {t("tillRemove")}
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="font-display text-[0.72rem] tracking-[0.18em] uppercase text-ink-soft">{t("tillTotal")}</span>
            <span className="font-display text-4xl">{formatPence(total)}</span>
          </div>
        </section>

        <section className="lg:sticky lg:top-20">
          <div className="border border-rule bg-paper-raised px-4 py-3" aria-live="polite">
            <p className="font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("tillLede")}</p>
            <p className="font-display text-5xl leading-none tabular-nums">{display}</p>
            <p className="mt-2 min-h-6 font-zh text-ink-soft">{previewText(exact, locale)}</p>
          </div>
          {error ? (
            <p className="mt-3 border-l-2 border-vermilion pl-3 text-sm" role="alert">
              {error}
            </p>
          ) : null}
          {sent ? (
            <p className="mt-3 text-sm">
              {t("tillSent")} #{sent.number}.{" "}
              <Link href={`/shop/ticket?order=${sent.id}`} className="text-vermilion underline">
                {t("viewTicket")}
              </Link>
            </p>
          ) : null}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "times", "0", "back"].map((key) => (
              <button
                key={key}
                type="button"
                className="min-h-14 cursor-pointer border border-rule bg-paper-raised font-display text-2xl active:bg-paper-deep"
                onClick={() => dispatch(key === "times" ? "times" : key === "back" ? "back" : key)}
                aria-label={key === "times" ? t("tillTimes") : key === "back" ? t("tillBackspace") : key}
              >
                {key === "times" ? "×" : key === "back" ? "⌫" : key}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Button variant="line" onClick={() => dispatch("clear")}>
              {t("tillClear")}
            </Button>
            <Button variant="vermilion" className="col-span-2" onClick={addDish}>
              {t("tillAdd")}
            </Button>
          </div>
          <Button variant="ink" className="mt-2 w-full" disabled={busy || lines.length === 0} onClick={() => void send()}>
            {t("tillSend")}
          </Button>
        </section>
      </div>
    </div>
  );

  function changeQty(number: number, delta: number) {
    setLines((current) =>
      current.flatMap((line) => {
        if (line.number !== number) return [line];
        const qty = line.qty + delta;
        if (qty <= 0) return [];
        return [{ ...line, qty: Math.min(99, qty) }];
      }),
    );
  }
}

function previewText(item: MenuItem | undefined, locale: string) {
  if (!item) return "";
  const name = primaryName(item.nameEn, item.nameZh, locale);
  const other = secondaryName(item.nameEn, item.nameZh, locale);
  return item.soldOut ? `${name} · ${other}` : `${name} · ${other}`;
}

function Toggle({ pressed, onClick, label }: { pressed: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`min-h-11 cursor-pointer border px-3 font-display ${pressed ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft"}`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block">
      <span className="font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase">{label}</span>
      <input
        value={value}
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full min-h-11 border border-rule bg-paper px-3"
      />
    </label>
  );
}

function IconButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="min-h-11 min-w-11 cursor-pointer border border-rule font-display text-lg">
      {label}
    </button>
  );
}
