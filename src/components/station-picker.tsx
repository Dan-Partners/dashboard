"use client";

import { allStations } from "@/lib/focus";
import { useI18n } from "@/lib/i18n";
import { stationGloss, stationName } from "@/lib/stations";
import type { Station } from "@/lib/types";

/**
 * The kitchen's station filter: one or more of the shop's stations, or all.
 * A shop with fewer than two stations has nothing to filter by.
 */
export function StationPicker({
  stations,
  picked,
  onToggle,
  onAll,
}: {
  stations: Station[];
  /** The stations shown large here (all of them when the tablet picked none). */
  picked: string[];
  onToggle: (station: string) => void;
  onAll: () => void;
}) {
  const { t, locale } = useI18n();
  if (stations.length < 2) return null;
  const all = allStations(picked, stations);
  const chip = (on: boolean) =>
    `min-h-11 cursor-pointer border px-3 font-display text-lg leading-none transition-transform duration-75 active:scale-[0.97] ${on ? "border-ink bg-ink text-paper" : "border-rule bg-paper text-ink-soft active:bg-paper-deep"}`;
  return (
    <fieldset className="flex flex-wrap items-center gap-2" data-testid="station-picker">
      <legend className="mb-1 font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("kitchenStations")}</legend>
      <button type="button" aria-pressed={all} className={chip(all)} onClick={onAll}>
        {t("kitchenAllStations")}
      </button>
      {stations.map((station) => {
        // With all on, a tap picks just that station; after that, taps add and remove.
        const on = !all && picked.includes(station.id);
        return (
          <button key={station.id} type="button" aria-pressed={on} className={chip(on)} onClick={() => onToggle(station.id)} data-station={station.id}>
            {stationName(stations, station.id, locale)} <span className="font-zh text-sm opacity-80">{stationGloss(stations, station.id, locale)}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
