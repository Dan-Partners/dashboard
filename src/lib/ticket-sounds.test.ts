import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forgetArrivals, noteBoard, onArrival, seeOrder, expectMine, type Arrival } from "./arrivals";
import { DEFAULT_BOARD } from "./board";
import { DEFAULT_TRIGGERS, soundFor, type Triggers } from "./triggers";
import type { Order } from "./types";

vi.mock("./sounds", () => ({ audioUnlocked: () => true, playSound: vi.fn(() => true) }));

const order = (id: string, status: Order["status"], column: string | null, columnAt: string, remap = false): Order =>
  ({ id, number: 1, status, column, columnAt, columnRemap: remap, createdAt: "2026-11-26T10:00:00Z", source: "online", fulfilment: "collection" }) as Order;

const column = (id: string) => DEFAULT_BOARD.columns.find((entry) => entry.id === id)!;

describe("missing settings", () => {
  it("ding only in the kitchen, only when a ticket enters the incoming column", () => {
    expect(soundFor(DEFAULT_TRIGGERS, column("new"), "kitchen")).toBe("ding");
    expect(soundFor(DEFAULT_TRIGGERS, column("new"), "pass")).toBeNull();
    expect(soundFor(DEFAULT_TRIGGERS, column("new"), "counter")).toBeNull();
    for (const other of ["preparing", "ready", "completed"]) expect(soundFor(DEFAULT_TRIGGERS, column(other), "kitchen")).toBeNull();
  });

  it("an added trigger plays where it says; a disabled one does not; by column id or by role", () => {
    const triggers: Triggers = {
      triggers: [
        ...DEFAULT_TRIGGERS.triggers,
        { id: "pass", event: "ticket_enters_role", column: null, role: "ready", action: "play_sound", sound: "chime", views: ["pass"], enabled: true },
        { id: "off", event: "ticket_enters_column", column: "completed", role: null, action: "play_sound", sound: "ding", views: ["counter"], enabled: false },
      ],
    };
    expect(soundFor(triggers, column("ready"), "pass")).toBe("chime");
    expect(soundFor(triggers, column("ready"), "kitchen")).toBeNull();
    expect(soundFor(triggers, column("completed"), "counter")).toBeNull();
    // A renamed incoming column keeps its 叮: roles, not names.
    expect(soundFor(DEFAULT_TRIGGERS, { ...column("new"), nameEn: "Incoming" }, "kitchen")).toBe("ding");
  });
});

describe("what counts as a ticket arriving", () => {
  let heard: Arrival[] = [];
  let stop = () => {};
  beforeEach(() => {
    forgetArrivals();
    heard = [];
    stop = onArrival((arrival) => heard.push(arrival));
  });
  afterEach(() => stop());

  it("a load is noted, never sounded; a live arrival is told once", () => {
    noteBoard([order("a", "new", "new", "t1")], DEFAULT_BOARD);
    seeOrder(order("a", "new", "new", "t1"), DEFAULT_BOARD);
    expect(heard).toHaveLength(0);
    seeOrder(order("b", "new", "new", "t2"), DEFAULT_BOARD);
    seeOrder(order("b", "new", "new", "t2"), DEFAULT_BOARD);
    expect(heard.map((arrival) => arrival.column.id)).toEqual(["new"]);
  });

  it("a refresh or reconnect brings missed tickets silently", () => {
    noteBoard([order("a", "new", "new", "t1")], DEFAULT_BOARD);
    noteBoard([order("a", "preparing", "preparing", "t3"), order("c", "new", "new", "t4")], DEFAULT_BOARD);
    seeOrder(order("c", "new", "new", "t4"), DEFAULT_BOARD);
    expect(heard).toHaveLength(0);
  });

  it("a board remap is not an arrival, and a later real move is", () => {
    noteBoard([order("a", "preparing", "packing", "t1")], DEFAULT_BOARD);
    seeOrder(order("a", "preparing", "preparing", "t5", true), DEFAULT_BOARD);
    expect(heard).toHaveLength(0);
    seeOrder(order("a", "ready", "ready", "t6"), DEFAULT_BOARD);
    expect(heard.map((arrival) => arrival.column.id)).toEqual(["ready"]);
  });

  it("this tablet's own move is not news to it", () => {
    noteBoard([order("a", "new", "new", "t1")], DEFAULT_BOARD);
    expectMine("a", "preparing");
    seeOrder(order("a", "preparing", "preparing", "t2"), DEFAULT_BOARD);
    expect(heard).toHaveLength(0);
  });
});

describe("playing", () => {
  it("one sound per event on this device, at least 400 ms apart", async () => {
    vi.useFakeTimers();
    // The tests run without a browser: a small stand-in for this device's storage.
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    vi.stubGlobal("window", {});
    const { queueSound } = await import("./sound-queue");
    const { playSound } = await import("./sounds");
    queueSound("x|new|t1", "ding", "kitchen");
    queueSound("x|new|t1", "ding", "kitchen");
    queueSound("y|new|t2", "ding", "kitchen");
    await vi.advanceTimersByTimeAsync(1000);
    const played = (window as unknown as { __danSounds: { key: string; at: number }[] }).__danSounds;
    expect(played.map((entry) => entry.key)).toEqual(["x|new|t1", "y|new|t2"]);
    expect(played[1].at - played[0].at).toBeGreaterThanOrEqual(400);
    expect(playSound).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
