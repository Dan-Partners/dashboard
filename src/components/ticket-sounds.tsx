"use client";

import { useEffect, useRef, useState } from "react";
import { onArrival } from "@/lib/arrivals";
import { DEFAULT_BOARD } from "@/lib/board";
import { useI18n } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import { queueSound } from "@/lib/sound-queue";
import { audioUnlocked, playSound, unlockAudio } from "@/lib/sounds";
import { writePersisted } from "@/lib/storage";
import { DEFAULT_TRIGGERS, soundFor, soundsHere, type SoundPlace } from "@/lib/triggers";

/**
 * Plays the owner's ticket sounds at this station, and the control that
 * turns them on. Browsers keep sound off until a tap on the page, so the
 * first visit asks for one; the choice is kept on this device, and after a
 * reload the first tap anywhere turns sound back on.
 */
export function TicketSounds({ place }: { place: SoundPlace }) {
  const { t } = useI18n();
  const shop = useShop();
  const triggers = shop.snapshot?.triggers ?? DEFAULT_TRIGGERS;
  const board = shop.snapshot?.board ?? DEFAULT_BOARD;
  const wanted = shop.persisted.sounds[place] === true;
  const [unlocked, setUnlocked] = useState(false);
  const latest = useRef({ triggers, wanted });

  useEffect(() => {
    latest.current = { triggers, wanted };
  }, [triggers, wanted]);

  // Sound already allowed on this page (an earlier tap): say so.
  useEffect(() => {
    const timer = window.setInterval(() => setUnlocked(audioUnlocked()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Wanted here but not allowed yet (after a reload): the first tap anywhere allows it.
  useEffect(() => {
    if (!wanted || unlocked) return;
    const allow = () => void unlockAudio().then(setUnlocked);
    window.addEventListener("pointerdown", allow, { once: true });
    window.addEventListener("keydown", allow, { once: true });
    return () => {
      window.removeEventListener("pointerdown", allow);
      window.removeEventListener("keydown", allow);
    };
  }, [wanted, unlocked]);

  useEffect(
    () =>
      onArrival((arrival) => {
        if (!latest.current.wanted) return;
        const sound = soundFor(latest.current.triggers, arrival.column, place);
        if (sound) queueSound(arrival.key, sound, place);
      }),
    [place],
  );

  if (!soundsHere(triggers, board, place)) return null;

  const turnOn = () => {
    writePersisted({ sounds: { ...shop.persisted.sounds, [place]: true } });
    void unlockAudio().then((ok) => {
      setUnlocked(ok);
      // A quiet sample, so staff know it works.
      if (ok) playSound("ding");
    });
  };

  if (!wanted) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-3 border-l-4 border-accent bg-accent/10 px-3 py-2" data-testid="sounds-off">
        <p className="min-w-0 flex-1">{t("soundsOffHere")}</p>
        <button type="button" className="min-h-12 cursor-pointer bg-accent px-5 font-display text-lg text-on-accent active:scale-[0.97]" onClick={turnOn} data-testid="sounds-enable">
          {t("soundsEnable")} <span className="font-zh">{t("soundsEnableGloss")}</span>
        </button>
      </div>
    );
  }
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-ink-soft" data-testid="sounds-on" data-unlocked={unlocked ? "true" : "false"}>
      <span>{unlocked ? t("soundsOn") : t("soundsTapToResume")}</span>
      <button
        type="button"
        className="min-h-11 cursor-pointer border border-rule px-3 font-display text-ink"
        onClick={() => writePersisted({ sounds: { ...shop.persisted.sounds, [place]: false } })}
        data-testid="sounds-mute"
      >
        {t("soundsMute")}
      </button>
    </div>
  );
}
