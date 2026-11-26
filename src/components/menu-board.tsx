"use client";

import { useMemo, useRef, useState } from "react";
import { isDanError } from "@/lib/errors";
import { formatPence, parsePoundsToPence, primaryName, secondaryName } from "@/lib/format";
import { messageForError, useI18n, type CopyKey } from "@/lib/i18n";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { ALLERGENS, STATIONS, type Allergen, type MenuItem, type Station } from "@/lib/types";
import { DishPhoto } from "./dish-photo";
import { Button, Dialog, PageTitle } from "./ui";

const ALLERGEN_KEY: Record<Allergen, CopyKey> = {
  celery: "allergenCelery",
  gluten: "allergenGluten",
  crustaceans: "allergenCrustaceans",
  eggs: "allergenEggs",
  fish: "allergenFish",
  lupin: "allergenLupin",
  milk: "allergenMilk",
  molluscs: "allergenMolluscs",
  mustard: "allergenMustard",
  nuts: "allergenNuts",
  peanuts: "allergenPeanuts",
  sesame: "allergenSesame",
  soya: "allergenSoya",
  sulphites: "allergenSulphites",
};

const STATION_KEY: Record<Station, CopyKey> = {
  wok: "stationWok",
  fryer: "stationFryer",
  rice: "stationRice",
  counter: "stationCounter",
};

export function MenuBoard() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const categories = shop.snapshot?.categories ?? [];
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const active = categoryId || categories[0]?.id;
  const visible = useMemo(
    () => (shop.snapshot?.items ?? []).filter((item) => item.categoryId === active).sort((a, b) => a.number - b.number),
    [active, shop.snapshot?.items],
  );

  return (
    <div>
      <PageTitle title={t("menuTitle")} gloss={locale === "zh-Hant" ? "Menu" : "餐牌"} />
      {!isOwner ? <p className="mb-4 max-w-xl text-sm text-ink-soft" data-testid="menu-counter-note">{t("menuCounterNote")}</p> : null}
      {notice ? <p className="mb-4 text-sm text-accent-ink">{notice}</p> : null}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            aria-pressed={category.id === active}
            className={`min-h-11 shrink-0 cursor-pointer border px-3 ${category.id === active ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft hover:bg-paper-deep"}`}
            onClick={() => setCategoryId(category.id)}
          >
            <span className="font-display">{primaryName(category.nameEn, category.nameZh, locale)}</span>
            <span className="ml-2 font-zh text-sm">{secondaryName(category.nameEn, category.nameZh, locale)}</span>
          </button>
        ))}
      </div>
      <ul className="divide-y divide-rule border-y border-rule">
        {visible.map((item) => (
          <li key={item.id} className={item.soldOut ? "opacity-70" : undefined}>
            <div className="flex items-start gap-3 py-3">
              {/* Only the owner edits a dish. With the PIN the row is read-only, and the sold-out switch still works. */}
              <button
                type="button"
                className={`min-w-0 flex-1 text-left ${isOwner ? "cursor-pointer" : "cursor-default"}`}
                disabled={!isOwner}
                onClick={() => setEditing(item)}
              >
                <span className="flex items-baseline gap-3">
                  <span className="w-10 shrink-0 font-display text-xl text-accent-ink">{item.number}</span>
                  <span className={item.soldOut ? "line-through" : undefined}>{primaryName(item.nameEn, item.nameZh, locale)}</span>
                  <span className="h-px min-w-6 flex-1 border-b border-dotted border-rule" />
                  <span className="font-display">{formatPence(item.pricePence)}</span>
                </span>
                <span className="mt-1 flex gap-3 pl-[3.25rem] text-sm text-ink-soft">
                  <span className="font-zh">{secondaryName(item.nameEn, item.nameZh, locale)}</span>
                  {item.soldOut ? <span className="font-display tracking-[0.14em] text-accent-ink uppercase">{t("menuSoldOut")}</span> : null}
                </span>
                {item.allergens.length > 0 ? (
                  <span className="mt-1 block pl-[3.25rem] text-xs tracking-wide text-ink-soft uppercase">
                    {item.allergens.map((allergen) => t(ALLERGEN_KEY[allergen])).join(" · ")}
                  </span>
                ) : null}
              </button>
              <DishPhoto photo={item.photo} size="thumb" className="mt-1 size-11 shrink-0 border border-rule" />
              <button
                type="button"
                role="switch"
                aria-checked={!item.soldOut}
                aria-label={`${item.number} ${item.nameEn}`}
                className={`mt-1 min-h-11 min-w-16 cursor-pointer border px-2 font-display text-sm ${item.soldOut ? "border-accent-ink text-accent-ink" : "border-rule"}`}
                onClick={() => {
                  setNotice(null);
                  void shop.updateItem(item.id, { soldOut: !item.soldOut }).catch((error: unknown) => {
                    setNotice(isDanError(error) ? error.message : t("errGeneric"));
                  });
                }}
              >
                {item.soldOut ? t("menuSoldOut") : t("menuOnMenu")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {editing ? (
        <EditDish
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice(t("menuSaved"));
          }}
        />
      ) : null}
    </div>
  );
}

function EditDish({ item, onClose, onSaved }: { item: MenuItem; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const shop = useShop();
  const categories = shop.snapshot?.categories ?? [];
  const [number, setNumber] = useState(String(item.number));
  const [nameEn, setNameEn] = useState(item.nameEn);
  const [nameZh, setNameZh] = useState(item.nameZh);
  const [price, setPrice] = useState((item.pricePence / 100).toFixed(2));
  const [categoryId, setCategoryId] = useState(item.categoryId);
  const [station, setStation] = useState<Station>(item.station);
  const [descriptionEn, setDescriptionEn] = useState(item.descriptionEn);
  const [allergens, setAllergens] = useState<Allergen[]>(item.allergens);
  const [soldOut, setSoldOut] = useState(item.soldOut);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const pricePence = parsePoundsToPence(price);
    const parsedNumber = Number(number);
    if (!nameEn.trim() || !nameZh.trim() || pricePence === null || !Number.isInteger(parsedNumber)) {
      setError(t("menuInvalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await shop.updateItem(item.id, {
        number: parsedNumber,
        nameEn,
        nameZh,
        pricePence,
        categoryId,
        station,
        descriptionEn,
        allergens,
        soldOut,
      });
      onSaved();
    } catch (caught) {
      const code = isDanError(caught) ? caught.code : undefined;
      setError(messageForError(code, t, caught instanceof Error ? caught.message : undefined));
      setBusy(false);
    }
  }

  return (
    <Dialog open title={t("menuEdit")} onClose={onClose}>
      <PhotoPicker itemId={item.id} />
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="font-display text-[0.72rem] tracking-[0.16em] uppercase text-ink-soft">{t("menuNumber")}</span>
            <input value={number} onChange={(event) => setNumber(event.target.value)} inputMode="numeric" className="mt-1 w-full min-h-11 border border-rule bg-paper-raised px-3" />
          </label>
          <label className="block">
            <span className="font-display text-[0.72rem] tracking-[0.16em] uppercase text-ink-soft">{t("menuPrice")}</span>
            <input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" className="mt-1 w-full min-h-11 border border-rule bg-paper-raised px-3" />
          </label>
        </div>
        <label className="block">
          <span className="font-display text-[0.72rem] tracking-[0.16em] uppercase text-ink-soft">{t("menuNameEn")}</span>
          <input value={nameEn} onChange={(event) => setNameEn(event.target.value)} className="mt-1 w-full min-h-11 border border-rule bg-paper-raised px-3" />
        </label>
        <label className="block">
          <span className="font-zh text-sm text-ink-soft">{t("menuNameZh")}</span>
          <input value={nameZh} onChange={(event) => setNameZh(event.target.value)} className="mt-1 w-full min-h-11 border border-rule bg-paper-raised px-3 font-zh" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="font-display text-[0.72rem] tracking-[0.16em] uppercase text-ink-soft">{t("menuCategory")}</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1 w-full min-h-11 border border-rule bg-paper-raised px-3">
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nameEn} {category.nameZh}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-display text-[0.72rem] tracking-[0.16em] uppercase text-ink-soft">{t("menuStation")}</span>
            <select value={station} onChange={(event) => setStation(event.target.value as Station)} className="mt-1 w-full min-h-11 border border-rule bg-paper-raised px-3">
              {STATIONS.map((value) => (
                <option key={value} value={value}>
                  {t(STATION_KEY[value])}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="font-display text-[0.72rem] tracking-[0.16em] uppercase text-ink-soft">{t("menuNote")}</span>
          <input value={descriptionEn} onChange={(event) => setDescriptionEn(event.target.value)} className="mt-1 w-full min-h-11 border border-rule bg-paper-raised px-3" />
        </label>
        <fieldset>
          <legend className="font-display text-[0.72rem] tracking-[0.16em] uppercase text-ink-soft">{t("menuAllergens")}</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {ALLERGENS.map((allergen) => (
              <label key={allergen} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={allergens.includes(allergen)}
                  onChange={() =>
                    setAllergens((current) =>
                      current.includes(allergen) ? current.filter((entry) => entry !== allergen) : [...current, allergen],
                    )
                  }
                />
                {t(ALLERGEN_KEY[allergen])}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={soldOut} onChange={(event) => setSoldOut(event.target.checked)} />
          {t("menuSoldOut")}
        </label>
        {error ? (
          <p role="alert" className="text-sm text-accent-ink">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="accent" className="flex-1" disabled={busy}>
            {t("menuSave")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * The dish's photo: added or replaced through the Dan cloud (taken with the
 * tablet's camera or chosen from its photos), removed on any server. It
 * saves at once, apart from the form below.
 */
function PhotoPicker({ itemId }: { itemId: string }) {
  const { t } = useI18n();
  const shop = useShop();
  const item = shop.snapshot?.items.find((entry) => entry.id === itemId);
  const session = shop.persisted.session;
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy: boolean; message: string | null; failed: boolean }>({ busy: false, message: null, failed: false });
  const demo = session?.mode === "demo";
  const cloudReady = Boolean(session?.cloudUrl && session.cloudToken) && shop.servers.cloud === "connected";
  const why = demo ? t("menuPhotoDemo") : cloudReady ? null : t("menuPhotoNeedsCloud");

  const run = (work: () => Promise<void>, done: string) => {
    setState({ busy: true, message: null, failed: false });
    void work()
      .then(() => setState({ busy: false, message: done, failed: false }))
      .catch((error: unknown) =>
        setState({ busy: false, message: error instanceof Error ? error.message : t("errGeneric"), failed: true }),
      );
  };

  return (
    <section className="mb-5 border-b border-rule pb-5" aria-label={t("menuPhoto")} data-testid="photo-picker">
      <p className="font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase">{t("menuPhoto")}</p>
      <div className="mt-2 flex items-start gap-4">
        {item?.photo ? (
          <DishPhoto photo={item.photo} size="thumb" className="size-24 shrink-0 border border-rule" alt={item.nameEn} />
        ) : (
          <div className="grid size-24 shrink-0 place-items-center border border-dashed border-rule text-ink-soft" aria-hidden>
            <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="5" width="18" height="14" rx="1" />
              <circle cx="9" cy="10" r="2" />
              <path d="m21 16-5-5-8 8" />
            </svg>
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="hidden"
            data-testid="photo-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) run(() => shop.addItemPhoto(itemId, file), t("menuPhotoSaved"));
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="line" disabled={Boolean(why) || state.busy} onClick={() => input.current?.click()}>
              {item?.photo ? t("menuPhotoReplace") : t("menuPhotoAdd")}
            </Button>
            {item?.photo ? (
              <Button type="button" variant="ghost" disabled={state.busy} onClick={() => run(() => shop.removeItemPhoto(itemId), t("menuPhotoRemoved"))}>
                {t("menuPhotoRemove")}
              </Button>
            ) : null}
          </div>
          <p className={`text-sm ${state.failed ? "text-accent-ink" : "text-ink-soft"}`} role={state.failed ? "alert" : "status"} data-testid="photo-status">
            {state.busy ? t("menuPhotoSending") : (state.message ?? why ?? t("menuPhotoHint"))}
          </p>
        </div>
      </div>
    </section>
  );
}
