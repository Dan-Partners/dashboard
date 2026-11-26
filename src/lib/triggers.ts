import { DanError } from "./errors";
import type { Board, BoardColumn, ColumnRole } from "./board";

/** Where a sound plays: a view (by its id), or `counter` for the orders board. */
export type SoundPlace = string;
/** The orders board, as a place a sound plays. */
export const COUNTER_PLACE = "counter";

/** The built-in sounds, made by the tablet itself (no recordings). */
export type Sound = "ding" | "chime";
export const SOUNDS: Sound[] = ["ding", "chime"];

export type Trigger = {
  id: string;
  event: "ticket_enters_column" | "ticket_enters_role";
  /** For ticket_enters_column: the column's id. */
  column: string | null;
  /** For ticket_enters_role. */
  role: ColumnRole | null;
  action: "play_sound";
  sound: Sound;
  /** View ids, and `counter` for the orders board. */
  views: SoundPlace[];
  enabled: boolean;
};

export type Triggers = { triggers: Trigger[] };

export const MAX_TRIGGERS = 20;

/** Nothing saved: the kitchen 叮 when a ticket enters the incoming column. */
export const DEFAULT_TRIGGERS: Triggers = {
  triggers: [
    { id: "kitchen-ding", event: "ticket_enters_role", column: null, role: "incoming", action: "play_sound", sound: "ding", views: ["kitchen"], enabled: true },
  ],
};

export const TRIGGER_FIELDS = "id event column role action sound views enabled";

/** The server's checks, with its codes. Returns them tidied. */
export function checkTriggers(value: Triggers): Triggers {
  if (value.triggers.length > MAX_TRIGGERS) throw new DanError("triggers_size", `Up to ${MAX_TRIGGERS} sounds.`);
  const seen = new Set<string>();
  const triggers = value.triggers.map((trigger) => {
    const id = trigger.id.trim();
    if (!/^[a-z0-9_-]{1,40}$/.test(id) || seen.has(id)) throw new DanError("triggers_ids", "Each sound needs its own id.");
    seen.add(id);
    const column = trigger.event === "ticket_enters_column" ? (trigger.column ?? "").trim() : null;
    const role = trigger.event === "ticket_enters_role" ? trigger.role : null;
    if (trigger.event === "ticket_enters_column" ? !/^[a-z0-9_-]{1,32}$/.test(column ?? "") : !role) {
      throw new DanError("triggers_column", "Choose the column for each sound.");
    }
    // Read too from what was saved before views, when the list was called stations.
    const places = trigger.views ?? (trigger as unknown as { stations?: string[] }).stations ?? [];
    const views = [...new Set(places.map((place) => place.trim()))];
    if (!views.length || views.some((place) => !/^[a-z0-9_-]{1,32}$/.test(place))) throw new DanError("triggers_views", "Choose where each sound plays.");
    return { id, event: trigger.event, column, role, action: trigger.action, sound: trigger.sound, views, enabled: trigger.enabled };
  });
  return { triggers };
}

export function normalizeTriggers(value: unknown): Triggers {
  try {
    const triggers = value as Triggers;
    if (!triggers || !Array.isArray(triggers.triggers)) return DEFAULT_TRIGGERS;
    return checkTriggers(triggers);
  } catch {
    return DEFAULT_TRIGGERS;
  }
}

/** The sound for a ticket entering `column`, here: the first enabled trigger that matches. One per ticket event. */
export function soundFor(triggers: Triggers, column: BoardColumn, place: SoundPlace): Sound | null {
  const match = triggers.triggers.find(
    (trigger) =>
      trigger.enabled &&
      trigger.views.includes(place) &&
      (trigger.event === "ticket_enters_column" ? trigger.column === column.id : trigger.role === column.role),
  );
  return match?.sound ?? null;
}

/** Whether anything can sound here at all (so the screen offers to turn sounds on). */
export function soundsHere(triggers: Triggers, board: Board, place: SoundPlace): boolean {
  return board.columns.some((column) => soundFor(triggers, column, place) !== null);
}

export function newTriggerId(): string {
  const letters = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "sound-";
  for (let i = 0; i < 6; i++) id += letters[Math.floor(Math.random() * letters.length)];
  return id;
}

/** Sounds only where they can still play: a view that has gone takes its sounds with it. */
export function onlyOn(triggers: Triggers, viewIds: string[]): Triggers {
  return {
    triggers: triggers.triggers
      .map((trigger) => ({ ...trigger, views: trigger.views.filter((place) => place === COUNTER_PLACE || viewIds.includes(place)) }))
      .filter((trigger) => trigger.views.length > 0),
  };
}

/** Refuses a sound that plays somewhere the shop does not have, as the server does. */
export function checkPlaces(triggers: Triggers, viewIds: string[]) {
  if (triggers.triggers.some((trigger) => trigger.views.some((place) => place !== COUNTER_PLACE && !viewIds.includes(place)))) {
    throw new DanError("triggers_views", "Choose where each sound plays: one of the shop's views, or the orders board.");
  }
}
