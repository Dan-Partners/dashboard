"use client";

import { useRouter } from "next/navigation";
import { enterFullscreen, focusRoute, pickedStations, pickStation, type Focus } from "@/lib/focus";
import { useI18n } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import { writePersisted } from "@/lib/storage";
import { viewName } from "@/lib/views";
import { StationPicker } from "./station-picker";
import { Dialog } from "./ui";

/**
 * Picks what this tablet is locked to: one of the owner's views, the till,
 * or the orders board. Anyone signed in can.
 */
export function FocusDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const shop = useShop();
  const router = useRouter();
  const stations = shop.snapshot?.stations ?? [];
  const views = shop.snapshot?.views ?? [];
  const saved = shop.persisted.kitchenStations;
  // The till's focus mode goes with the till.
  const tillOn = shop.snapshot?.ordering.settings.till ?? true;

  const lock = (focus: Focus) => {
    // Full screen needs this tap; asked before anything else happens.
    enterFullscreen();
    writePersisted({ focus });
    onClose();
    router.replace(focusRoute(focus));
  };

  const choice = (testId: string, name: string, hint: string, focus: Focus, extra?: React.ReactNode) => (
    <div key={testId} className="border border-rule bg-paper-raised p-3">
      <button
        type="button"
        className="flex min-h-11 w-full cursor-pointer flex-col items-start text-left transition-transform duration-75 active:scale-[0.99]"
        onClick={() => lock(focus)}
        data-testid={testId}
      >
        <span className="font-display text-2xl leading-tight">
          {t("focusStart")} {name}
        </span>
        <span className="text-sm text-ink-soft">{hint}</span>
      </button>
      {extra}
    </div>
  );

  return (
    <Dialog open={open} title={t("focusTitle")} onClose={onClose}>
      <p className="mb-4 text-ink-soft">{t("focusLede")}</p>
      <div className="space-y-3" data-testid="focus-dialog">
        {views.map((view) =>
          choice(
            `focus-${view.id}`,
            viewName(view, locale),
            t(view.look === "make" ? "viewsLookMakeHint" : "viewsLookHandOverHint"),
            { position: "view", view: view.id },
            // A make view can be narrowed to stations before it is locked.
            view.look === "make" && stations.length > 1 ? (
              <div className="mt-3">
                <StationPicker
                  stations={stations}
                  picked={pickedStations(saved, stations)}
                  onToggle={(station) => writePersisted({ kitchenStations: pickStation(saved, station, stations) })}
                  onAll={() => writePersisted({ kitchenStations: [] })}
                />
              </div>
            ) : undefined,
          ),
        )}
        {tillOn ? choice("focus-till", t("navTill"), t("focusTillHint"), { position: "till" }) : null}
        {choice("focus-board", t("focusBoard"), t("focusBoardHint"), { position: "board" })}
      </div>
    </Dialog>
  );
}
