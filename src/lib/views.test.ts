import { describe, expect, it } from "vitest";
import { DEFAULT_BOARD, type Board } from "./board";
import { checkPlaces, checkTriggers, DEFAULT_TRIGGERS, onlyOn, soundFor, type Triggers } from "./triggers";
import { checkViews, followBoard, kitchenAndPass, newViewId, normalizeViews, viewGloss, viewName, viewRoute, type View } from "./views";

const view = (id: string, name: string, look: View["look"], columns: string[]): View => ({ id, nameEn: name, nameZh: "", look, columns });
const code = (work: () => unknown) => {
  try {
    work();
    return null;
  } catch (error) {
    return (error as { code: string }).code;
  }
};

describe("the owner's views", () => {
  it("starts a restaurant with the kitchen and the pass, on its own board", () => {
    const views = kitchenAndPass(DEFAULT_BOARD);
    expect(views.map((entry) => [entry.id, entry.look, entry.columns])).toEqual([
      ["kitchen", "make", ["new", "preparing", "ready"]],
      ["pass", "hand_over", ["ready"]],
    ]);
    expect(viewName(views[0], "en")).toBe("Kitchen");
    expect(viewName(views[0], "zh-Hant")).toBe("廚房");
    expect(viewGloss(views[0], "en")).toBe("廚房");
    expect(viewRoute("kitchen")).toBe("/shop/view/kitchen");
  });

  it("checks a list as the server does", () => {
    const tidied = checkViews([view(" packing ", " Packing ", "make", ["ready", "new", "ready"])], DEFAULT_BOARD);
    expect(tidied[0]).toEqual({ id: "packing", nameEn: "Packing", nameZh: "Packing", look: "make", columns: ["new", "ready"] });
    expect(viewGloss(tidied[0], "en")).toBe("");
    expect(checkViews([], DEFAULT_BOARD)).toEqual([]);
    expect(checkViews([view("bar", "Bar", "make", [])], DEFAULT_BOARD)[0].columns).toEqual([]);
    expect(code(() => checkViews([view("bar", " ", "make", [])], DEFAULT_BOARD))).toBe("views_name");
    expect(code(() => checkViews([view("counter", "Counter", "make", [])], DEFAULT_BOARD))).toBe("views_ids");
    expect(code(() => checkViews([view("Bar", "Bar", "make", [])], DEFAULT_BOARD))).toBe("views_ids");
    expect(code(() => checkViews([view("bar", "Bar", "make", []), view("bar", "Bar 2", "make", [])], DEFAULT_BOARD))).toBe("views_ids");
    expect(code(() => checkViews([view("bar", "Bar", "make", ["grill"])], DEFAULT_BOARD))).toBe("views_columns");
    expect(code(() => checkViews(Array.from({ length: 13 }, (_, n) => view(`v${n}`, "V", "make", [])), DEFAULT_BOARD))).toBe("views_size");
  });

  it("makes a new view's id from its name, never one that is used or kept back", () => {
    expect(newViewId("Packing bench", [])).toBe("packing-bench");
    expect(newViewId("Counter", [])).toBe("counter-2");
    expect(newViewId("Kitchen", ["kitchen"])).toBe("kitchen-2");
    expect(newViewId("包裝", [])).toBe("view");
  });

  it("reads saved views against the board, and falls back to the kitchen and the pass", () => {
    expect(normalizeViews(undefined, DEFAULT_BOARD).map((entry) => entry.id)).toEqual(["kitchen", "pass"]);
    expect(normalizeViews([], DEFAULT_BOARD)).toEqual([]);
    // A column the board no longer has is dropped, not a reason to lose the view.
    expect(normalizeViews([view("bar", "Bar", "make", ["new", "grill"])], DEFAULT_BOARD)[0].columns).toEqual(["new"]);
  });

  it("follows the board when columns come and go", () => {
    const views = [view("kitchen", "Kitchen", "make", ["new", "preparing", "ready"]), view("pass", "Pass", "hand_over", ["ready"]), view("intake", "Intake", "make", ["new"])];
    const withPacking: Board = {
      columns: [...DEFAULT_BOARD.columns.slice(0, 2), { id: "packing", nameEn: "Packing", nameZh: "包裝", role: "in_progress", colour: "#7a4fd0" }, ...DEFAULT_BOARD.columns.slice(2)],
    };
    const after = followBoard(views, DEFAULT_BOARD, withPacking);
    // The kitchen showed the whole in-progress stage, so it shows the new column too.
    expect(after[0].columns).toEqual(["new", "preparing", "packing", "ready"]);
    expect(after[1].columns).toEqual(["ready"]);
    expect(after[2].columns).toEqual(["new"]);
    const back = followBoard(after, withPacking, DEFAULT_BOARD);
    expect(back[0].columns).toEqual(["new", "preparing", "ready"]);
  });
});

describe("sounds on views", () => {
  const ready = DEFAULT_BOARD.columns[2];
  const triggers: Triggers = {
    triggers: [
      ...DEFAULT_TRIGGERS.triggers,
      { id: "packing-chime", event: "ticket_enters_role", column: null, role: "ready", action: "play_sound", sound: "chime", views: ["packing", "counter"], enabled: true },
    ],
  };

  it("plays a sound on the views it names, and on the orders board as counter", () => {
    expect(soundFor(triggers, ready, "packing")).toBe("chime");
    expect(soundFor(triggers, ready, "counter")).toBe("chime");
    expect(soundFor(triggers, ready, "kitchen")).toBeNull();
  });

  it("drops a view that has gone from its sounds, and a sound with nowhere left", () => {
    const left = onlyOn(triggers, ["packing"]);
    expect(left.triggers.map((trigger) => trigger.id)).toEqual(["packing-chime"]);
    expect(onlyOn(triggers, []).triggers[0].views).toEqual(["counter"]);
    expect(code(() => checkPlaces(triggers, ["kitchen"]))).toBe("triggers_views");
    expect(code(() => checkPlaces(triggers, ["kitchen", "packing"]))).toBeNull();
  });

  it("reads sounds saved before views, when the list was called stations", () => {
    const old = { id: "kitchen-ding", event: "ticket_enters_role", column: null, role: "incoming", action: "play_sound", sound: "ding", stations: ["kitchen", "counter"], enabled: true };
    const read = checkTriggers({ triggers: [old as never] });
    expect(read.triggers[0].views).toEqual(["kitchen", "counter"]);
    expect(code(() => checkTriggers({ triggers: [{ ...triggers.triggers[1], views: [] }] }))).toBe("triggers_views");
  });
});
