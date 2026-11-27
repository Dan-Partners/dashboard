"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useState } from "react";
import { amountLabel, signedPence } from "@/lib/addons";
import { isDanError } from "@/lib/errors";
import { formatPence, orderLabel, primaryName, secondaryName } from "@/lib/format";
import { messageForError, useI18n } from "@/lib/i18n";
import { dishesFor, draftKey, hasKitchen, mergeDraft, priceSlip, type Draft } from "@/lib/create-order";
import { lineTotal, offered } from "@/lib/pricing";
import { useShop } from "@/lib/shop-context";
import { writePersisted } from "@/lib/storage";
import { lineDetails } from "@/lib/ticket";
import type { MenuItem } from "@/lib/types";
import { defaultChoice, DishChooser, type DishChoice } from "./dish-chooser";
import { DishPhoto } from "./dish-photo";
import { LineDetails } from "./line-details";
import { Button, PageTitle } from "./ui";

type Entry = { phase: "dish" | "qty"; qty: number; digits: string };
/** The dish being chosen: a new line, or (`editing`) one already on the slip. */
type Choosing = { item: MenuItem; editing: string | null; start?: DishChoice };

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

/**
 * Create order: staff take an order at the counter or on the phone. Two ways
 * to add dishes, chosen per device: picking from the menu (by category, or
 * searched by name or number), or the till's keypad, keyed by dish number.
 * A tablet locked to the till is always on the keypad.
 */
export function CreateOrder() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const items = useMemo(() => shop.snapshot?.items ?? [], [shop.snapshot?.items]);
  const [entry, dispatch] = useReducer(entryReducer, { phase: "dish", qty: 1, digits: "" });
  const [lines, setLines] = useState<Draft[]>([]);
  // The bill add-ons ticked. Null: nobody has touched them, so the ones ticked by default.
  const [billTicked, setBillTicked] = useState<string[] | null>(null);
  const [choosing, setChoosing] = useState<Choosing | null>(null);
  const allAddons = useMemo(() => shop.snapshot?.addons ?? [], [shop.snapshot?.addons]);
  // What staff are offered: the add-ons for orders created here, not the online-only ones.
  const dishAddons = useMemo(() => offered(allAddons, "dish", "local"), [allAddons]);
  const billAddons = useMemo(() => offered(allAddons, "bill", "local"), [allAddons]);
  const [fulfilment, setFulfilment] = useState<"collection" | "delivery">("collection");
  const [source, setSource] = useState<"counter" | "phone">("counter");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ id: string; number: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = shop.persisted.focus?.position === "till";
  const mode = locked ? "till" : shop.persisted.createMode;
  // A shop with no kitchen (no "make" view) places an order; it does not send one to a kitchen.
  const kitchen = hasKitchen(shop.snapshot?.views ?? []);

  const exact = items.find((item) => String(item.number) === entry.digits);

  /** Adds a dish as chosen; with nothing chosen, as it comes: the first of each "choose one", and the add-ons ticked by default. */
  function add(item: MenuItem, qty: number, choice?: Omit<DishChoice, "qty">) {
    setError(null);
    if (item.soldOut) {
      setError(`${item.number} ${primaryName(item.nameEn, item.nameZh, locale)} · ${t("tillSoldOut")}`);
      return;
    }
    const taken = choice ?? defaultChoice(item, dishAddons);
    setLines((current) => mergeDraft(current, { number: item.number, qty, options: taken.options, addons: taken.addons }));
    setSent(null);
  }

  /** A dish with options is chosen first; any other goes straight on the slip. */
  function pick(item: MenuItem, qty: number) {
    if (!item.soldOut && (item.options?.length ?? 0) > 0) {
      setError(null);
      setChoosing({ item, editing: null, start: { ...defaultChoice(item, dishAddons), qty } });
      return;
    }
    add(item, qty);
  }

  function chosen(choice: DishChoice) {
    if (!choosing) return;
    const { item, editing } = choosing;
    setChoosing(null);
    if (editing === null) return add(item, choice.qty, choice);
    // A line changed on the slip: taken off as it was, put back as it is now.
    setLines((current) => mergeDraft(current.filter((line) => draftKey(line) !== editing), { number: item.number, qty: choice.qty, options: choice.options, addons: choice.addons }));
  }

  function addKeyed() {
    setError(null);
    if (!entry.digits) return;
    const item = items.find((candidate) => String(candidate.number) === entry.digits);
    if (!item) {
      setError(t("tillUnknown"));
      return;
    }
    pick(item, entry.phase === "qty" ? entry.qty : 1);
    if (!item.soldOut) dispatch("clear");
  }

  useEffect(() => {
    // The keys are the keypad's: only in till mode.
    if (mode !== "till" || choosing) return;
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
        addKeyed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The slip priced by the server's own rule, so staff see the bill before it is sent. The server still decides.
  const slip = useMemo(() => priceSlip(lines, billTicked, items, allAddons), [lines, billTicked, items, allAddons]);
  const total = slip.totalPence;
  const display = entry.phase === "qty" ? `${entry.qty} × ${entry.digits || "—"}` : entry.digits || "—";

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
        ...slip.input,
      });
      // A new order is a new customer: nothing of this one is left in the form.
      setLines([]);
      setBillTicked(null);
      setNotes("");
      setPhone("");
      setName("");
      setAddress("");
      setSent({ id: order.id, number: order.number });
    } catch (caught) {
      const code = isDanError(caught) ? caught.code : undefined;
      setError(messageForError(code, t, caught instanceof Error ? caught.message : undefined));
    } finally {
      setBusy(false);
    }
  }

  const title = locked ? null : (
    <>
      <PageTitle className="mb-4" title={t("createOrder")} gloss={locale === "zh-Hant" ? "Create order" : "開單"} />
      <p className="mb-5">
        <Link href="/shop/orders" className="inline-flex min-h-11 items-center font-display text-ink-soft underline">
          ← {t("createBack")}
        </Link>
      </p>
    </>
  );

  if (shop.snapshot && !shop.snapshot.ordering.settings.till) {
    return (
      <div>
        {title}
        <p className="max-w-xl border-l-2 border-accent pl-3" data-testid="till-off">
          {t("tillOff")}
        </p>
      </div>
    );
  }

  const messages = (
    <>
      {error ? (
        <p className="mt-3 border-l-2 border-accent pl-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {sent ? (
        <p className="mt-3 text-sm" role="status" data-testid="order-sent">
          {t(kitchen ? "tillSent" : "createPlaced")} {orderLabel(sent.number, t("numberWaiting"))}.{" "}
          {locked ? null : (
            <Link href={`/shop/ticket?order=${sent.id}`} className="text-accent-ink underline">
              {t("viewTicket")}
            </Link>
          )}
        </p>
      ) : null}
    </>
  );
  const sendButton = (
    <Button variant="ink" className="mt-2 w-full" disabled={busy || lines.length === 0} onClick={() => void send()}>
      {t(kitchen ? "tillSend" : "createPlace")}
    </Button>
  );

  return (
    <div data-create-mode={mode}>
      {title}
      {locked ? null : (
        <div className="mb-5 flex gap-0" role="group" aria-label={t("createMode")}>
          {(["menu", "till"] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={mode === choice}
              className={`min-h-11 min-w-24 cursor-pointer border px-4 font-display active:scale-[0.97] ${mode === choice ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft hover:bg-paper-deep"}`}
              onClick={() => writePersisted({ createMode: choice })}
              data-testid={`create-mode-${choice}`}
            >
              {t(choice === "menu" ? "createModeMenu" : "createModeTill")}
            </button>
          ))}
        </div>
      )}
      <div className={`grid grid-cols-[minmax(0,1fr)] items-start gap-6 ${mode === "menu" ? "lg:grid-cols-2" : "lg:grid-cols-[minmax(0,1fr)_22rem]"}`}>
        {/* On a phone the menu comes first: pick, then check the slip. The keypad stays under the slip, as the till always was. */}
        <div className={`torn-wrap ${mode === "menu" ? "order-2 lg:order-1" : ""}`}>
          <section className="torn border border-b-0 border-rule bg-paper-raised p-4" data-testid="order-slip">
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
                <Field label={t(kitchen ? "tillNotes" : "createNotes")} value={notes} onChange={setNotes} />
              </div>
            </div>
            <ul className="mt-5 divide-y divide-rule border-y border-rule">
              {lines.length === 0 ? <li className="py-4 text-ink-soft">{t("tillEmpty")}</li> : null}
              {slip.rows.map(({ key, draft, item, line, problem }) => (
                <li key={key} className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 py-3" data-testid="slip-line" data-number={draft.number}>
                  <DishPhoto photo={item?.photo} size="thumb" className="size-11 shrink-0" />
                  <span className="w-10 font-display text-xl text-accent-ink">{draft.number}</span>
                  <span className="min-w-[7rem] flex-1">
                    <span className="block">{item ? primaryName(item.nameEn, item.nameZh, locale) : t("tillUnknown")}</span>
                    {item ? <span className="font-zh text-sm text-ink-soft">{secondaryName(item.nameEn, item.nameZh, locale)}</span> : null}
                    {line ? <LineDetails details={lineDetails(line)} /> : null}
                    {problem ? (
                      <span className="block text-sm text-accent-ink" role="alert">
                        {messageForError(problem.code, t, problem.message)}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-1">
                    <IconButton label="−" onClick={() => changeQty(key, -1)} />
                    <span className="w-6 text-center font-display" data-testid="slip-qty">
                      {draft.qty}
                    </span>
                    <IconButton label="+" onClick={() => changeQty(key, 1)} />
                  </span>
                  <span className="w-16 text-right font-display" data-testid="slip-line-total">
                    {line ? formatPence(lineTotal(line)) : "—"}
                  </span>
                  {/* How the dish is taken can be changed where it has options, or where the shop has add-ons for a dish. */}
                  {item && !problem && ((item.options?.length ?? 0) > 0 || dishAddons.length > 0) ? (
                    <button
                      type="button"
                      className="min-h-11 min-w-11 cursor-pointer px-1 text-sm text-ink-soft underline active:text-ink"
                      onClick={() => setChoosing({ item, editing: key, start: { options: draft.options, addons: draft.addons, qty: draft.qty } })}
                      data-testid="slip-change"
                    >
                      {t("slipChange")}
                    </button>
                  ) : null}
                  <button type="button" className="min-h-11 min-w-11 cursor-pointer px-1 text-sm text-ink-soft active:text-ink" onClick={() => setLines((current) => current.filter((entryLine) => draftKey(entryLine) !== key))}>
                    {t("tillRemove")}
                  </button>
                </li>
              ))}
            </ul>
            {billAddons.length > 0 ? (
              <fieldset className="mt-3" data-testid="slip-addons">
                <legend className="font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase">{t("slipBillAddons")}</legend>
                {billAddons.map((addon) => {
                  const applied = slip.addons.find((entryAddon) => entryAddon.id === addon.id);
                  return (
                    <label key={addon.id} className={`flex min-h-11 items-center gap-3 ${addon.required ? "" : "cursor-pointer"}`}>
                      <input
                        type="checkbox"
                        checked={slip.billIds.includes(addon.id)}
                        disabled={addon.required}
                        onChange={() => setBillTicked(slip.billIds.includes(addon.id) ? slip.billIds.filter((id) => id !== addon.id) : [...slip.billIds, addon.id])}
                        data-testid="slip-addon"
                        data-addon={addon.id}
                      />
                      <span className="min-w-0 flex-1">
                        {primaryName(addon.nameEn, addon.nameZh, locale)}
                        <span className="ml-2 text-sm text-ink-soft">{amountLabel(addon)}</span>
                        {addon.required ? <span className="ml-2 text-sm text-ink-soft">· {t("chooseRequired")}</span> : null}
                      </span>
                      <span className="w-20 text-right font-display" data-testid="slip-addon-amount">
                        {applied && lines.length > 0 ? signedPence(applied.amountPence) : ""}
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ) : null}
            <div className="mt-4 flex items-baseline justify-between">
              <span className="font-display text-[0.72rem] tracking-[0.18em] uppercase text-ink-soft">{t("tillTotal")}</span>
              <span className="font-display text-4xl" data-testid="slip-total">
                {formatPence(total)}
              </span>
            </div>
            {mode === "menu" ? (
              <>
                {messages}
                {sendButton}
              </>
            ) : null}
          </section>
        </div>

        {mode === "till" ? (
          <section className="lg:sticky lg:top-20" data-testid="till-keypad">
            <div className="relative border border-rule bg-paper-raised px-4 py-3" aria-live="polite">
              {/* The dish being keyed, so the right one is added. */}
              <DishPhoto photo={exact?.photo} size="thumb" className="absolute top-3 right-3 size-20" alt="" />
              <p className="font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("tillLede")}</p>
              <p className="font-display text-5xl leading-none tabular-nums">{display}</p>
              <p className="mt-2 min-h-6 font-zh text-ink-soft">{previewText(exact, locale)}</p>
            </div>
            {messages}
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
              <Button variant="accent" className="col-span-2" onClick={addKeyed}>
                {t("tillAdd")}
              </Button>
            </div>
            {sendButton}
          </section>
        ) : (
          <MenuPicker items={items} lines={lines} total={total} onPick={(item) => pick(item, 1)} />
        )}
      </div>
      {choosing ? (
        <DishChooser
          key={`${choosing.item.id}:${choosing.editing ?? "new"}`}
          item={choosing.item}
          menu={items}
          dishAddons={dishAddons}
          lockRequired
          start={choosing.start}
          confirmLabel={t(choosing.editing === null ? "chooseAdd" : "chooseUpdate")}
          onConfirm={chosen}
          onClose={() => setChoosing(null)}
        />
      ) : null}
    </div>
  );

  function changeQty(key: string, delta: number) {
    setLines((current) =>
      current.flatMap((line) => {
        if (draftKey(line) !== key) return [line];
        const qty = line.qty + delta;
        if (qty <= 0) return [];
        return [{ ...line, qty: Math.min(99, qty) }];
      }),
    );
  }
}

/** The menu to pick from: a search by name or number, the categories, and the dishes. A tap adds one. */
function MenuPicker({ items, lines, total, onPick }: { items: MenuItem[]; lines: Draft[]; total: number; onPick: (item: MenuItem) => void }) {
  const { t, locale } = useI18n();
  const shop = useShop();
  const categories = useMemo(() => [...(shop.snapshot?.categories ?? [])].sort((a, b) => a.sort - b.sort), [shop.snapshot?.categories]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const shown = useMemo(() => dishesFor(items, categories, categoryId, search), [items, categories, categoryId, search]);
  const searching = search.trim() !== "";

  return (
    <section className="order-1 min-w-0 lg:order-2" data-testid="menu-picker">
      <label className="block">
        <span className="font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase">{t("createSearch")}</span>
        <input
          type="search"
          value={search}
          maxLength={40}
          onChange={(event) => setSearch(event.target.value)}
          className="mt-1 min-h-11 w-full border border-rule bg-paper-raised px-3"
          data-testid="menu-picker-search"
        />
      </label>
      {categories.length > 1 ? (
        <div className={`-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 ${searching ? "opacity-50" : ""}`}>
          <CategoryChip pressed={categoryId === null} onClick={() => setCategoryId(null)} name={t("createAll")} gloss="" />
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              pressed={categoryId === category.id}
              onClick={() => {
                setCategoryId(category.id);
                setSearch("");
              }}
              name={primaryName(category.nameEn, category.nameZh, locale)}
              gloss={secondaryName(category.nameEn, category.nameZh, locale)}
            />
          ))}
        </div>
      ) : null}
      {items.length === 0 ? <p className="mt-4 text-ink-soft">{t("menuEmptyCounter")}</p> : shown.length === 0 ? <p className="mt-4 text-ink-soft">{t("createNoDishes")}</p> : null}
      <ul className="mt-3 divide-y divide-rule border-y border-rule lg:max-h-[calc(100dvh-19rem)] lg:overflow-y-auto">
        {shown.map((item) => {
          const inSlip = lines.filter((line) => line.number === item.number).reduce((sum, line) => sum + line.qty, 0);
          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={item.soldOut}
                onClick={() => onPick(item)}
                className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-1 py-2 text-left active:bg-paper-deep disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="menu-picker-dish"
                data-number={item.number}
              >
                <DishPhoto photo={item.photo} size="thumb" className="size-11 shrink-0" />
                <span className="w-10 shrink-0 font-display text-xl text-accent-ink">{item.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block leading-tight">{primaryName(item.nameEn, item.nameZh, locale)}</span>
                  <span className="font-zh text-sm text-ink-soft">{secondaryName(item.nameEn, item.nameZh, locale)}</span>
                </span>
                {inSlip > 0 ? (
                  <span className="bg-ink px-1.5 py-0.5 font-display text-sm text-paper" aria-label={`${t("createInSlip")} ${inSlip}`}>
                    ×{inSlip}
                  </span>
                ) : null}
                <span className="w-16 shrink-0 text-right font-display">{item.soldOut ? t("menuSoldOut") : formatPence(item.pricePence)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {/* On a phone the slip is under the whole menu: a bar above the menu bar says what is on it, and goes there. */}
      {lines.length > 0 ? (
        <button
          type="button"
          className="sticky bottom-[4.25rem] z-10 mt-3 flex min-h-12 w-full cursor-pointer items-center justify-between bg-ink px-4 font-display text-paper active:scale-[0.99] lg:hidden"
          onClick={() => document.querySelector('[data-testid="order-slip"]')?.scrollIntoView({ behavior: "smooth", block: "start" })}
          data-testid="to-slip"
        >
          <span>
            {t("createToSlip")} · ×{lines.reduce((sum, line) => sum + line.qty, 0)}
          </span>
          <span>{formatPence(total)}</span>
        </button>
      ) : null}
    </section>
  );
}

function CategoryChip({ pressed, onClick, name, gloss }: { pressed: boolean; onClick: () => void; name: string; gloss: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`min-h-11 shrink-0 cursor-pointer border px-3 ${pressed ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft hover:bg-paper-deep"}`}
    >
      <span className="font-display">{name}</span>
      {gloss ? <span className="ml-1.5 font-zh text-sm">{gloss}</span> : null}
    </button>
  );
}

function previewText(item: MenuItem | undefined, locale: string) {
  if (!item) return "";
  const name = primaryName(item.nameEn, item.nameZh, locale);
  const other = secondaryName(item.nameEn, item.nameZh, locale);
  return other ? `${name} · ${other}` : name;
}

function Toggle({ pressed, onClick, label }: { pressed: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`min-h-11 cursor-pointer border px-3 font-display active:scale-[0.97] ${pressed ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft active:bg-paper-deep"}`}
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
    <button type="button" aria-label={label} onClick={onClick} className="min-h-11 min-w-11 cursor-pointer border border-rule font-display text-lg active:bg-paper-deep">
      {label}
    </button>
  );
}
