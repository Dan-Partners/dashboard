"use client";

import { allStations } from "@/lib/focus";
import { useI18n } from "@/lib/i18n";
import { STATION_GLOSS, STATION_LABEL } from "@/lib/stations";
import { STATIONS, type Station } from "@/lib/types";

/** The kitchen's station filter: one or more stations, or all. */
export function StationPicker({ value, onToggle, onAll }: { value: Station[]; onToggle: (station: Station) => void; onAll: () => void }) {
  const { t } = useI18n();
  const all = allStations(value);
  const chip = (on: boolean) =>
    `min-h-11 cursor-pointer border px-3 font-display text-lg leading-none ${on ? "border-ink bg-ink text-paper" : "border-rule bg-paper text-ink-soft"}`;
  return (
    <fieldset className="flex flex-wrap items-center gap-2" data-testid="station-picker">
      <legend className="mb-1 font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("kitchenStations")}</legend>
      <button type="button" aria-pressed={all} className={chip(all)} onClick={onAll}>
        {t("kitchenAllStations")}
      </button>
      {STATIONS.map((station) => {
        // With all on, a tap picks just that station; after that, taps add and remove.
        const on = !all && value.includes(station);
        return (
          <button
            key={station}
            type="button"
            aria-pressed={on}
            className={chip(on)}
            onClick={() => onToggle(station)}
          >
            {t(STATION_LABEL[station])} <span className="font-zh text-sm opacity-80">{t(STATION_GLOSS[station])}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
