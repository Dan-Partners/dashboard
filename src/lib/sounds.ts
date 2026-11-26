import type { Sound } from "./triggers";

/*
 * The built-in sounds, made here with the Web Audio API: no recordings, so
 * nothing to license. Played at a modest level; the device's own volume
 * does the rest. Browsers keep audio off until a tap on the page, so a
 * station asks for that tap once (see SoundsBar).
 */

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

/** True once the browser lets this page play sound. */
export function audioUnlocked(): boolean {
  return audio()?.state === "running";
}

/** Call from a tap: lets the page play sound from now on. */
export async function unlockAudio(): Promise<boolean> {
  const ctx = audio();
  if (!ctx) return false;
  try {
    await ctx.resume();
  } catch {
    return false;
  }
  return ctx.state === "running";
}

const LEVEL = 0.22;

function tone(ctx: AudioContext, at: number, frequency: number, length: number, level: number, type: OscillatorType) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

/** Plays a sound now. Returns false if the page may not play sound yet. */
export function playSound(sound: Sound): boolean {
  const ctx = audio();
  if (!ctx || ctx.state !== "running") return false;
  const now = ctx.currentTime;
  if (sound === "ding") {
    // 叮: one short, bright strike with a quiet overtone.
    tone(ctx, now, 1568, 0.9, LEVEL, "sine");
    tone(ctx, now, 3136, 0.35, LEVEL * 0.25, "sine");
  } else {
    // A soft chime: two gentle notes going up.
    tone(ctx, now, 784, 1.1, LEVEL * 0.8, "triangle");
    tone(ctx, now + 0.16, 1046.5, 1.2, LEVEL * 0.8, "triangle");
  }
  return true;
}
