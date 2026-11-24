"use client";

import { useMemo, useState } from "react";
import { isDanError } from "@/lib/errors";
import { formatPence, parsePoundsToPence, primaryName, secondaryName } from "@/lib/format";
import { messageForError, useI18n, type CopyKey } from "@/lib/i18n";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { ALLERGENS, STATIONS, type Allergen, type MenuItem, type Station } from "@/lib/types";
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
