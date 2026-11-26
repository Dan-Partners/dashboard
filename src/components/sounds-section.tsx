"use client";

import { useState } from "react";
import { columnName, DEFAULT_BOARD, ROLES, type ColumnRole } from "@/lib/board";
import { isDanError } from "@/lib/errors";
import { messageForError, useI18n, type CopyKey } from "@/lib/i18n";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { playSound, unlockAudio } from "@/lib/sounds";
import { checkPlaces, checkTriggers, COUNTER_PLACE, DEFAULT_TRIGGERS, MAX_TRIGGERS, newTriggerId, SOUNDS, type Sound, type Trigger, type Triggers } from "@/lib/triggers";
import { viewName } from "@/lib/views";
import { Button } from "./ui";

const ROLE_WORD: Record<ColumnRole, CopyKey> = {
  incoming: "roleIncoming",
  in_progress: "roleInProgress",
  ready: "roleReady",
  completed: "roleCompleted",
};
const SOUND_WORD: Record<Sound, CopyKey> = { ding: "soundDing", chime: "soundChime" };

/**
 * The owner's ticket sounds: when a ticket enters a column (or any column
 * of a kind, so a rename keeps it), play a sound on any of the shop's views,
 * or on the orders board. The counter PIN sees them read-only.
 */
export function SoundsSection() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const board = shop.snapshot?.board ?? DEFAULT_BOARD;
  const saved = shop.snapshot?.triggers ?? DEFAULT_TRIGGERS;
  const views = shop.snapshot?.views ?? [];
  // Where a sound can play: each view, then the orders board.
  const places = [...views.map((view) => ({ id: view.id, name: viewName(view, locale) })), { id: COUNTER_PLACE, name: t("placeCounter") }];
  const [draft, setDraft] = useState<Triggers | null>(null);
  const list = (draft ?? saved).triggers;
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  const edit = (index: number, change: Partial<Trigger>) => {
    setMessage(null);
    setDraft({ triggers: list.map((trigger, at) => (at === index ? { ...trigger, ...change } : trigger)) });
  };
  const failed = (error: unknown) =>
    setMessage({ text: messageForError(isDanError(error) ? error.code : undefined, t, error instanceof Error ? error.message : undefined), failed: true });

  /** The event as one choice: "role:incoming" or "column:<id>". */
  const eventValue = (trigger: Trigger) => (trigger.event === "ticket_enters_role" ? `role:${trigger.role}` : `column:${trigger.column}`);
  const setEvent = (index: number, value: string) => {
    const [kind, id] = value.split(":");
    edit(index, kind === "role" ? { event: "ticket_enters_role", role: id as ColumnRole, column: null } : { event: "ticket_enters_column", column: id, role: null });
  };

  const save = () => {
    setMessage(null);
    let next: Triggers;
    try {
      next = checkTriggers({ triggers: list });
      checkPlaces(next, views.map((view) => view.id));
    } catch (error) {
      failed(error);
      return;
    }
    setBusy(true);
    void shop
      .saveTriggers(next)
      .then(() => {
        setDraft(null);
        setMessage({ text: t("soundsSaved"), failed: false });
      })
      .catch(failed)
      .finally(() => setBusy(false));
  };

  const reset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      window.setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    setConfirmReset(false);
    setBusy(true);
    void shop
      .resetTriggers()
      .then(() => {
        setDraft(null);
        setMessage({ text: t("soundsResetDone"), failed: false });
      })
      .catch(failed)
      .finally(() => setBusy(false));
  };

  const add = () => {
    setMessage(null);
    setDraft({
      triggers: [...list, { id: newTriggerId(), event: "ticket_enters_role", column: null, role: "ready", action: "play_sound", sound: "chime", views: [views.find((view) => view.look === "hand_over")?.id ?? views[0]?.id ?? COUNTER_PLACE], enabled: true }],
    });
  };

  const removedColumn = (trigger: Trigger) => trigger.event === "ticket_enters_column" && !board.columns.some((column) => column.id === trigger.column);

  return (
    <section aria-labelledby="board-sounds" className="mt-10" data-testid="sounds-section">
      <h2 id="board-sounds" className="font-display text-2xl">
        {t("soundsTitle")}
      </h2>
      <p className="mt-1 mb-3 text-sm text-ink-soft">{t("soundsLede")}</p>
      <ol className="divide-y divide-rule border-y border-rule" data-testid="sound-list">
        {list.map((trigger, index) => (
          <li key={trigger.id} className="flex flex-wrap items-end gap-3 py-3" data-testid={`sound-${index}`}>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="size-5" checked={trigger.enabled} disabled={!isOwner} aria-label={`${t("soundOn")} ${index + 1}`} onChange={(event) => edit(index, { enabled: event.target.checked })} />
              <span className="text-sm">{t("soundOn")}</span>
            </label>
            <label>
              <span className="block font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("soundWhen")}</span>
              <select className="mt-1 min-h-11 border border-rule bg-paper-raised px-2" value={eventValue(trigger)} disabled={!isOwner} aria-label={`${t("soundWhen")} ${index + 1}`} onChange={(event) => setEvent(index, event.target.value)}>
                <optgroup label={t("soundAnyColumnOf")}>
                  {ROLES.map((role) => (
                    <option key={role} value={`role:${role}`}>
                      {t("soundEnters")} {t(ROLE_WORD[role])} ({t("soundAnyKind")})
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t("soundThisColumn")}>
                  {board.columns.map((column) => (
                    <option key={column.id} value={`column:${column.id}`}>
                      {t("soundEnters")} {columnName(column, locale)}
                    </option>
                  ))}
                  {removedColumn(trigger) ? <option value={eventValue(trigger)}>{t("soundRemovedColumn")}</option> : null}
                </optgroup>
              </select>
            </label>
            <label>
              <span className="block font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("soundWhich")}</span>
              <select className="mt-1 min-h-11 border border-rule bg-paper-raised px-2" value={trigger.sound} disabled={!isOwner} aria-label={`${t("soundWhich")} ${index + 1}`} onChange={(event) => edit(index, { sound: event.target.value as Sound })}>
                {SOUNDS.map((sound) => (
                  <option key={sound} value={sound}>
                    {t(SOUND_WORD[sound])}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="flex flex-wrap gap-2" disabled={!isOwner}>
              <legend className="font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("soundWhere")}</legend>
              {places.map((place) => (
                <label key={place.id} className="flex min-h-11 items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={trigger.views.includes(place.id)}
                    aria-label={`${place.name} ${index + 1}`}
                    onChange={(event) => edit(index, { views: event.target.checked ? [...trigger.views, place.id] : trigger.views.filter((entry) => entry !== place.id) })}
                  />
                  {place.name}
                </label>
              ))}
            </fieldset>
            <div className="flex gap-1">
              <Button variant="line" className="px-3" aria-label={`${t("soundTry")} ${index + 1}`} onClick={() => void unlockAudio().then((ok) => ok && playSound(trigger.sound))}>
                ▶
              </Button>
              {isOwner ? (
                <Button variant="line" className="px-3" aria-label={`${t("soundRemove")} ${index + 1}`} onClick={() => setDraft({ triggers: list.filter((_, at) => at !== index) })}>
                  ✕
                </Button>
              ) : null}
            </div>
          </li>
        ))}
        {list.length === 0 ? <li className="py-3 text-ink-soft">{t("soundsNone")}</li> : null}
      </ol>
      {isOwner ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="line" disabled={list.length >= MAX_TRIGGERS} onClick={add}>
            {t("soundsAdd")}
          </Button>
          <Button variant="accent" className="min-h-12 px-8" disabled={busy} onClick={save}>
            {t("soundsSave")}
          </Button>
          <Button variant="line" disabled={busy} onClick={reset} data-testid="sounds-reset">
            {confirmReset ? t("confirmTap") : t("soundsReset")}
          </Button>
        </div>
      ) : null}
      {message ? (
        <p className={`mt-4 border-l-2 pl-3 ${message.failed ? "border-accent text-accent-ink" : "border-[#2f7d4f]"}`} role={message.failed ? "alert" : "status"} data-testid="sounds-message">
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
