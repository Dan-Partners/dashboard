import { DanError } from "./errors";
import type { Board, BoardColumn, ColumnRole } from "./board";

/** Where a sound plays: the kitchen, the pass, or the orders board at the counter. */
export type SoundPlace = "kitchen" | "pass" | "counter";
export const SOUND_PLACES: SoundPlace[] = ["kitchen", "pass", "counter"];

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
  stations: SoundPlace[];
  enabled: boolean;
};

export type Triggers = { triggers: Trigger[] };

export const MAX_TRIGGERS = 20;

/** Nothing saved: the kitchen 叮 when a ticket enters the incoming column. */
export const DEFAULT_TRIGGERS: Triggers = {
  triggers: [
    { id: "kitchen-ding", event: "ticket_enters_role", column: null, role: "incoming", action: "play_sound", sound: "ding", stations: ["kitchen"], enabled: true },
  ],
};

export const TRIGGER_FIELDS = "id event column role action sound stations enabled";

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
    const stations = SOUND_PLACES.filter((place) => trigger.stations.includes(place));
    if (!stations.length) throw new DanError("triggers_stations", "Choose where each sound plays.");
    return { ...trigger, id, column, role, stations };
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
      trigger.stations.includes(place) &&
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
