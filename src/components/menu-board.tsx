"use client";

import { useMemo, useRef, useState } from "react";
import { isDanError } from "@/lib/errors";
import { formatPence, parsePoundsToPence, primaryName, secondaryName } from "@/lib/format";
import { messageForError, useI18n, type CopyKey } from "@/lib/i18n";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { defaultStation, stationGloss, stationName } from "@/lib/stations";
import { ALLERGENS, type Allergen, type Category, type DanClient, type MenuItem } from "@/lib/types";
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

export function MenuBoard() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const categories = shop.snapshot?.categories ?? [];
  const items = shop.snapshot?.items ?? [];
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The chosen category, or the first one if it has gone.
  const active = categories.some((category) => category.id === categoryId) ? categoryId : categories[0]?.id;
  const visible = useMemo(
    () => (shop.snapshot?.items ?? []).filter((item) => item.categoryId === active).sort((a, b) => a.number - b.number),
    [active, shop.snapshot?.items],
  );

  return (
    <div>
      <PageTitle title={t("menuTitle")} gloss={locale === "zh-Hant" ? "Menu" : "餐牌"} />
      {!isOwner ? <p className="mb-4 max-w-xl text-sm text-ink-soft" data-testid="menu-counter-note">{t("menuCounterNote")}</p> : null}
      {isOwner ? (
        <div className="mb-4 flex flex-wrap gap-2" data-testid="menu-tools">
          {categories.length > 0 ? (
            <Button type="button" variant="accent" onClick={() => setAdding(true)}>
              {t("menuAddDish")}
            </Button>
          ) : null}
          <Button type="button" variant="line" onClick={() => setArranging(true)}>
            {categories.length > 0 ? t("menuEditCategories") : t("menuAddCategory")}
          </Button>
        </div>
      ) : null}
      {notice ? (
        <p className="mb-4 text-sm text-accent-ink" role="status" data-testid="menu-notice">
          {notice}
        </p>
      ) : null}
      {categories.length === 0 ? (
        <div className="border-y border-rule py-10 text-center" data-testid="menu-empty">
          <p className="font-display text-2xl">{t("menuEmptyTitle")}</p>
          <p className="mt-2 text-ink-soft">{t(isOwner ? "menuEmptyLede" : "menuEmptyCounter")}</p>
        </div>
      ) : (
        <>
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
          {visible.length === 0 ? (
            <p className="border-y border-rule py-8 text-center text-ink-soft" data-testid="category-empty">
              {t("menuCategoryEmpty")}
            </p>
          ) : null}
          <ul className={visible.length > 0 ? "divide-y divide-rule border-y border-rule" : undefined}>
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
        </>
      )}
      {editing ? (
        <DishForm
          key={editing.id}
          item={editing}
          categoryId={editing.categoryId}
          onClose={() => setEditing(null)}
          onDone={(message) => {
            setEditing(null);
            setNotice(message);
          }}
        />
      ) : null}
      {adding && active ? (
        <DishForm
          item={null}
          categoryId={active}
          nextNumber={nextFreeNumber(items)}
          onClose={() => setAdding(false)}
          onDone={(message, category) => {
            setAdding(false);
            setNotice(message);
            if (category) setCategoryId(category);
          }}
        />
      ) : null}
      {arranging ? <CategoriesDialog onClose={() => setArranging(false)} /> : null}
    </div>
  );
}

/** The number after the highest on the menu, or the first gap once 999 is taken. */
export function nextFreeNumber(items: Pick<MenuItem, "number">[]): number {
  const used = new Set(items.map((item) => item.number));
  const after = Math.max(0, ...used) + 1;
  if (after <= 999) return after;
  for (let number = 1; number <= 999; number += 1) if (!used.has(number)) return number;
  return 999;
}

const FIELD_LABEL = "font-display text-[0.72rem] tracking-[0.16em] uppercase text-ink-soft";
const FIELD_INPUT = "mt-1 w-full min-h-11 border border-rule bg-paper-raised px-3";

/** Adds a dish (`item` null) or edits one. The owner can also remove a dish here. */
function DishForm({
  item,
  categoryId: startCategory,
  nextNumber,
  onClose,
  onDone,
}: {
  item: MenuItem | null;
  categoryId: string;
  nextNumber?: number;
  onClose: () => void;
  onDone: (message: string, categoryId?: string) => void;
}) {
  const { t, locale } = useI18n();
  const shop = useShop();
  const categories = shop.snapshot?.categories ?? [];
  const [number, setNumber] = useState(String(item?.number ?? nextNumber ?? 1));
  const [nameEn, setNameEn] = useState(item?.nameEn ?? "");
  const [nameZh, setNameZh] = useState(item && item.nameZh !== item.nameEn ? item.nameZh : "");
  const [price, setPrice] = useState(item ? (item.pricePence / 100).toFixed(2) : "");
  const [categoryId, setCategoryId] = useState(startCategory);
  const stations = shop.snapshot?.stations ?? [];
  const [station, setStation] = useState<string>(item ? item.station : defaultStation(stations));
  const [descriptionEn, setDescriptionEn] = useState(item?.descriptionEn ?? "");
  const [allergens, setAllergens] = useState<Allergen[]>(item?.allergens ?? []);
  const [soldOut, setSoldOut] = useState(item?.soldOut ?? false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  const fail = (caught: unknown) => {
    const code = isDanError(caught) ? caught.code : undefined;
    setError(messageForError(code, t, caught instanceof Error ? caught.message : undefined));
    setBusy(false);
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const pricePence = parsePoundsToPence(price);
    const parsedNumber = Number(number);
    if ((!nameEn.trim() && !nameZh.trim()) || pricePence === null || !Number.isInteger(parsedNumber)) {
      setError(t("menuInvalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (item) {
        await shop.updateItem(item.id, { number: parsedNumber, nameEn, nameZh, pricePence, categoryId, station, descriptionEn, allergens, soldOut });
        onDone(t("menuSaved"));
      } else {
        await shop.editMenu((client) =>
          client.createMenuItem({ number: parsedNumber, nameEn, nameZh, pricePence, categoryId, station, descriptionEn, allergens }),
        );
        onDone(t("menuAdded"), categoryId);
      }
    } catch (caught) {
      fail(caught);
    }
  }

  async function remove() {
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      await shop.editMenu((client) => client.deleteMenuItem(item.id));
      onDone(t("menuRemoved"));
    } catch (caught) {
      setRemoving(false);
      fail(caught);
    }
  }

  return (
    <Dialog open title={item ? t("menuEdit") : t("menuNew")} onClose={onClose}>
      {item ? <PhotoPicker itemId={item.id} /> : null}
      <form onSubmit={save} className="space-y-4" data-testid="dish-form">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={FIELD_LABEL}>{t("menuNumber")}</span>
            <input name="dish-number" value={number} onChange={(event) => setNumber(event.target.value)} inputMode="numeric" className={FIELD_INPUT} />
          </label>
          <label className="block">
            <span className={FIELD_LABEL}>{t("menuPrice")}</span>
            <input name="dish-price" value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" placeholder="0.00" className={FIELD_INPUT} />
          </label>
        </div>
        <label className="block">
          <span className={FIELD_LABEL}>{t("menuNameEn")}</span>
          <input name="dish-name" value={nameEn} onChange={(event) => setNameEn(event.target.value)} className={FIELD_INPUT} />
        </label>
        <label className="block">
          <span className="font-zh text-sm text-ink-soft">{t("menuNameZh")}</span>
          <input name="dish-name-zh" value={nameZh} onChange={(event) => setNameZh(event.target.value)} className={`${FIELD_INPUT} font-zh`} />
          <span className="mt-1 block text-sm text-ink-soft">{t("menuNameOne")}</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={FIELD_LABEL}>{t("menuCategory")}</span>
            <select name="dish-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={FIELD_INPUT}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.nameZh && category.nameZh !== category.nameEn ? `${category.nameEn} ${category.nameZh}` : category.nameEn}
                </option>
              ))}
            </select>
          </label>
          {/* A shop with no stations has nothing to choose. */}
          {stations.length > 0 ? (
            <label className="block">
              <span className={FIELD_LABEL}>{t("menuStation")}</span>
              <select name="dish-station" value={station} onChange={(event) => setStation(event.target.value)} className={FIELD_INPUT}>
                {stations.map((entry) => {
                  const gloss = stationGloss(stations, entry.id, locale);
                  return (
                    <option key={entry.id} value={entry.id}>
                      {stationName(stations, entry.id, locale)}
                      {gloss ? ` ${gloss}` : ""}
                    </option>
                  );
                })}
                <option value="">{t("menuNoStation")}</option>
              </select>
            </label>
          ) : null}
        </div>
        <label className="block">
          <span className={FIELD_LABEL}>{t("menuNote")}</span>
          <input value={descriptionEn} onChange={(event) => setDescriptionEn(event.target.value)} className={FIELD_INPUT} />
        </label>
        <fieldset>
          <legend className={FIELD_LABEL}>{t("menuAllergens")}</legend>
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
        {item ? (
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={soldOut} onChange={(event) => setSoldOut(event.target.checked)} />
            {t("menuSoldOut")}
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-accent-ink" data-testid="dish-error">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="accent" className="flex-1" disabled={busy}>
            {item ? t("menuSave") : t("menuAdd")}
          </Button>
        </div>
        {item ? (
          <div className="border-t border-rule pt-4">
            {/* Two taps: removing a dish cannot be undone. */}
            {removing ? (
              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={() => setRemoving(false)}>
                  {t("cancel")}
                </Button>
                <Button type="button" variant="ink" className="flex-1" disabled={busy} onClick={() => void remove()} data-testid="dish-remove-confirm">
                  {t("menuRemoveConfirm")}
                </Button>
              </div>
            ) : (
              <Button type="button" variant="line" className="w-full" disabled={busy} onClick={() => setRemoving(true)} data-testid="dish-remove">
                {t("menuRemove")}
              </Button>
            )}
          </div>
        ) : null}
      </form>
    </Dialog>
  );
}

/** The owner's categories: add, rename, put in order, and remove an empty one. */
function CategoriesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const shop = useShop();
  const categories = shop.snapshot?.categories ?? [];
  const items = shop.snapshot?.items ?? [];
  const [nameEn, setNameEn] = useState("");
  const [nameZh, setNameZh] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (work: (client: DanClient) => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    void shop
      .editMenu(work)
      .then(() => after?.())
      .catch((caught: unknown) => {
        const code = isDanError(caught) ? caught.code : undefined;
        setError(messageForError(code, t, caught instanceof Error ? caught.message : undefined));
      })
      .finally(() => setBusy(false));
  };

  const move = (index: number, by: -1 | 1) => {
    const ids = categories.map((category) => category.id);
    const to = index + by;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    run((client) => client.reorderCategories(ids));
  };

  return (
    <Dialog open title={t("menuCategoriesTitle")} onClose={onClose}>
      <ul className="divide-y divide-rule border-y border-rule" data-testid="categories-list">
        {categories.map((category, index) => (
          <CategoryRow
            key={`${category.id}:${category.nameEn}:${category.nameZh}`}
            category={category}
            dishes={items.filter((item) => item.categoryId === category.id).length}
            first={index === 0}
            last={index === categories.length - 1}
            busy={busy}
            onRename={(names) => run((client) => client.updateCategory(category.id, names))}
            onMove={(by) => move(index, by)}
            onRemove={() => run((client) => client.deleteCategory(category.id))}
          />
        ))}
      </ul>
      <form
        className="mt-5 space-y-3"
        data-testid="category-new"
        onSubmit={(event) => {
          event.preventDefault();
          if (!nameEn.trim() && !nameZh.trim()) return setError(t("menuCategoryNeedsName"));
          // The form empties as soon as the server has the category, not after the
          // menu has been read again: the next name may already be being typed.
          const sent = { nameEn, nameZh };
          run((client) =>
            client.createCategory(sent).then((category) => {
              setNameEn((now) => (now === sent.nameEn ? "" : now));
              setNameZh((now) => (now === sent.nameZh ? "" : now));
              return category;
            }),
          );
        }}
      >
        <p className="font-display text-lg">{t("menuCategoryNew")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={FIELD_LABEL}>{t("menuCategoryName")}</span>
            <input name="category-name" value={nameEn} onChange={(event) => setNameEn(event.target.value)} maxLength={60} className={FIELD_INPUT} />
          </label>
          <label className="block">
            <span className="font-zh text-sm text-ink-soft">{t("menuCategoryNameZh")}</span>
            <input name="category-name-zh" value={nameZh} onChange={(event) => setNameZh(event.target.value)} maxLength={40} className={`${FIELD_INPUT} font-zh`} />
          </label>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-accent-ink" data-testid="category-error">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
            {t("menuCategoriesDone")}
          </Button>
          <Button type="submit" variant="accent" className="flex-1" disabled={busy}>
            {t("menuAddCategory")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CategoryRow({
  category,
  dishes,
  first,
  last,
  busy,
  onRename,
  onMove,
  onRemove,
}: {
  category: Category;
  dishes: number;
  first: boolean;
  last: boolean;
  busy: boolean;
  onRename: (names: { nameEn: string; nameZh: string }) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const oneName = category.nameEn === category.nameZh;
  const [nameEn, setNameEn] = useState(category.nameEn);
  const [nameZh, setNameZh] = useState(oneName ? "" : category.nameZh);
  const changed = nameEn.trim() !== category.nameEn || nameZh.trim() !== (oneName ? "" : category.nameZh);
  const small = "min-h-11 min-w-11 cursor-pointer border border-rule px-2 font-display text-sm disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <li className="py-3" data-testid="category-row" data-category={category.nameEn}>
      <div className="grid gap-2 sm:grid-cols-2">
        <input aria-label={`${t("menuCategoryName")}: ${category.nameEn}`} value={nameEn} onChange={(event) => setNameEn(event.target.value)} maxLength={60} className="min-h-11 w-full border border-rule bg-paper-raised px-3" />
        <input aria-label={`${t("menuCategoryNameZh")}: ${category.nameEn}`} value={nameZh} onChange={(event) => setNameZh(event.target.value)} maxLength={40} className="min-h-11 w-full border border-rule bg-paper-raised px-3 font-zh" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className={small} disabled={busy || first} onClick={() => onMove(-1)} aria-label={`${t("menuCategoryUp")}: ${category.nameEn}`}>
          ↑
        </button>
        <button type="button" className={small} disabled={busy || last} onClick={() => onMove(1)} aria-label={`${t("menuCategoryDown")}: ${category.nameEn}`}>
          ↓
        </button>
        {/* Only an empty category can go; its dishes are moved or removed first. */}
        <button type="button" className={small} disabled={busy || dishes > 0} onClick={onRemove} title={dishes > 0 ? t("menuCategoryNotEmpty") : undefined}>
          {t("menuCategoryRemove")}
        </button>
        <span className="text-sm text-ink-soft">{dishes}</span>
        {changed ? (
          <button
            type="button"
            className={`${small} ml-auto border-ink bg-ink text-paper`}
            disabled={busy || (!nameEn.trim() && !nameZh.trim())}
            onClick={() => onRename({ nameEn, nameZh })}
          >
            {t("menuSave")}
          </button>
        ) : null}
      </div>
    </li>
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
