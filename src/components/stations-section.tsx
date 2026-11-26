"use client";

import { useState } from "react";
import { isDanError } from "@/lib/errors";
import { messageForError, useI18n } from "@/lib/i18n";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { checkRemovals, checkStations, dishesByStation, MAX_STATIONS, MAX_STATION_NAME, newStationId } from "@/lib/stations";
import type { Station } from "@/lib/types";
import { Button } from "./ui";

/** A row being edited. A new station has no id until it is saved. */
type Row = { id: string | null; nameEn: string; nameZh: string };

const toRows = (stations: Station[]): Row[] =>
  stations.map((station) => ({ id: station.id, nameEn: station.nameEn, nameZh: station.nameZh === station.nameEn ? "" : station.nameZh }));

/**
 * The owner names the shop's stations: where dishes are made or packed.
 * Kitchen screens, tickets and printers split by them. A shop can have none.
 * The counter PIN sees the list, read-only.
 */
export function StationsSection() {
  const { t } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const saved = shop.snapshot?.stations ?? [];
  const items = shop.snapshot?.items ?? [];
  const [draft, setDraft] = useState<Row[] | null>(null);
  const rows = draft ?? toRows(saved);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const dishes = dishesByStation(items);

  const edit = (change: (rows: Row[]) => Row[]) => {
    setMessage(null);
    setDraft(change(rows.map((row) => ({ ...row }))));
  };
  const failed = (error: unknown) =>
    setMessage({ text: messageForError(isDanError(error) ? error.code : undefined, t, error instanceof Error ? error.message : undefined), failed: true });

  const save = () => {
    setMessage(null);
    let next: Station[];
    try {
      // A new station gets its id from its name here, once, and keeps it.
      const taken = rows.map((row) => row.id).filter((id): id is string => id !== null);
      const named = rows.map((row) => {
        if (row.id) return { id: row.id, nameEn: row.nameEn, nameZh: row.nameZh };
        const id = newStationId(row.nameEn || row.nameZh, taken);
        taken.push(id);
        return { id, nameEn: row.nameEn, nameZh: row.nameZh };
      });
      next = checkStations(named);
      checkRemovals(saved, next, items);
    } catch (error) {
      failed(error);
      return;
    }
    setBusy(true);
    void shop
      .saveStations(next)
      .then(() => {
        setDraft(null);
        setMessage({ text: t("shopDetailsSaved"), failed: false });
      })
      .catch(failed)
      .finally(() => setBusy(false));
  };

  const small = "min-h-11 min-w-11 cursor-pointer border border-rule px-2 font-display text-sm disabled:cursor-not-allowed disabled:opacity-40";
  const field = "min-h-11 w-full border border-rule bg-paper-raised px-3 disabled:opacity-70";

  return (
    <section aria-labelledby="stations-title" className="mt-10 max-w-3xl border-t border-rule pt-8" data-testid="stations-section">
      <h2 id="stations-title" className="font-display text-2xl">
        {t("stationsTitle")}
      </h2>
      <p className="mt-1 mb-4 text-ink-soft">{t("stationsLede")}</p>
      {!isOwner ? <p className="mb-4 text-sm text-ink-soft" data-testid="stations-owner-only">{t("stationsOwnerOnly")}</p> : null}
      {rows.length === 0 ? (
        <p className="border-y border-rule py-6 text-ink-soft" data-testid="stations-none">
          {t("stationsNone")}
        </p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {rows.map((row, index) => {
            const count = row.id ? (dishes.get(row.id) ?? 0) : 0;
            const label = row.nameEn || row.nameZh || t("stationsNew");
            return (
              <li key={row.id ?? `new-${index}`} className="py-3" data-testid="station-row" data-station={row.id ?? ""}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    aria-label={`${t("menuCategoryName")}: ${label}`}
                    value={row.nameEn}
                    maxLength={MAX_STATION_NAME}
                    disabled={!isOwner}
                    placeholder={t("menuCategoryName")}
                    className={field}
                    onChange={(event) => edit((list) => list.map((entry, at) => (at === index ? { ...entry, nameEn: event.target.value } : entry)))}
                  />
                  <input
                    aria-label={`${t("menuCategoryNameZh")}: ${label}`}
                    value={row.nameZh}
                    maxLength={MAX_STATION_NAME}
                    disabled={!isOwner}
                    placeholder={t("menuCategoryNameZh")}
                    className={`${field} font-zh`}
                    onChange={(event) => edit((list) => list.map((entry, at) => (at === index ? { ...entry, nameZh: event.target.value } : entry)))}
                  />
                </div>
                {isOwner ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={small}
                      disabled={busy || index === 0}
                      aria-label={`${t("menuCategoryUp")}: ${label}`}
                      onClick={() =>
                        edit((list) => {
                          [list[index - 1], list[index]] = [list[index], list[index - 1]];
                          return list;
                        })
                      }
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={small}
                      disabled={busy || index === rows.length - 1}
                      aria-label={`${t("menuCategoryDown")}: ${label}`}
                      onClick={() =>
                        edit((list) => {
                          [list[index + 1], list[index]] = [list[index], list[index + 1]];
                          return list;
                        })
                      }
                    >
                      ↓
                    </button>
                    {/* A station still on dishes cannot go: they are moved first. */}
                    <button
                      type="button"
                      className={small}
                      disabled={busy || count > 0}
                      title={count > 0 ? t("stationsInUse") : undefined}
                      aria-label={`${t("menuCategoryRemove")}: ${label}`}
                      onClick={() => edit((list) => list.filter((_, at) => at !== index))}
                    >
                      {t("menuCategoryRemove")}
                    </button>
                    <span className="text-sm text-ink-soft" data-testid="station-dishes">
                      {count} {t(count === 1 ? "stationsDish" : "stationsDishes")}
                    </span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {isOwner ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" variant="line" disabled={busy || rows.length >= MAX_STATIONS} onClick={() => edit((list) => [...list, { id: null, nameEn: "", nameZh: "" }])}>
            {t("stationsAdd")}
          </Button>
          <Button type="button" variant="accent" disabled={busy || draft === null} onClick={save}>
            {t("stationsSave")}
          </Button>
          {draft !== null && !message ? <span className="text-sm text-ink-soft">{t("stationsUnsaved")}</span> : null}
          {message ? (
            <p className={`text-sm ${message.failed ? "text-accent-ink" : "text-ink-soft"}`} role={message.failed ? "alert" : "status"} data-testid="stations-status">
              {message.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
