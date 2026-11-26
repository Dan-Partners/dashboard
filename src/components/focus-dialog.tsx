"use client";

import { useRouter } from "next/navigation";
import { enterFullscreen, pickedStations, POSITION_ROUTE, pickStation, POSITIONS, type Position } from "@/lib/focus";
import { useI18n, type CopyKey } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import { writePersisted } from "@/lib/storage";
import { POSITION_LABEL } from "./focus-frame";
import { StationPicker } from "./station-picker";
import { Dialog } from "./ui";

const HINT: Record<Position, CopyKey> = {
  kitchen: "focusKitchenHint",
  till: "focusTillHint",
  pass: "focusPassHint",
  board: "focusBoardHint",
};

/** Picks the job this tablet is locked to. Anyone signed in can. */
export function FocusDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const shop = useShop();
  const router = useRouter();
  const stations = shop.snapshot?.stations ?? [];
  const saved = shop.persisted.kitchenStations;

  const lock = (position: Position) => {
    // Full screen needs this tap; asked before anything else happens.
    enterFullscreen();
    writePersisted({ focus: { position } });
    onClose();
    router.replace(POSITION_ROUTE[position]);
  };

  return (
    <Dialog open={open} title={t("focusTitle")} onClose={onClose}>
      <p className="mb-4 text-ink-soft">{t("focusLede")}</p>
      <div className="space-y-3" data-testid="focus-dialog">
        {/* The till's focus mode goes with the till. */}
        {POSITIONS.filter((position) => position !== "till" || (shop.snapshot?.ordering.settings.till ?? true)).map((position) => (
          <div key={position} className="border border-rule bg-paper-raised p-3">
            <button
              type="button"
              className="flex min-h-11 w-full cursor-pointer flex-col items-start text-left transition-transform duration-75 active:scale-[0.99]"
              onClick={() => lock(position)}
              data-testid={`focus-${position}`}
            >
              <span className="font-display text-2xl leading-tight">
                {t("focusStart")} {t(POSITION_LABEL[position])}
              </span>
              <span className="text-sm text-ink-soft">{t(HINT[position])}</span>
            </button>
            {position === "kitchen" ? (
              <div className="mt-3">
                <StationPicker
                  stations={stations}
                  picked={pickedStations(saved, stations)}
                  onToggle={(station) => writePersisted({ kitchenStations: pickStation(saved, station, stations) })}
                  onAll={() => writePersisted({ kitchenStations: [] })}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
