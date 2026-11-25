import { describe, expect, it } from "vitest";
import { createTapGuard } from "./tap-guard";

describe("the tap guard", () => {
  it("drops a second tap in the quiet moment after one, and allows the next", async () => {
    let clock = 1000;
    const guard = createTapGuard(() => clock, 700);
    let runs = 0;
    const act = () => {
      runs += 1;
      return Promise.resolve(runs);
    };
    await guard.run(act);
    clock += 120;
    expect(guard.run(act)).toBeNull();
    clock += 700;
    await guard.run(act);
    expect(runs).toBe(2);
  });

  it("starts the quiet moment again when a slow change lands", async () => {
    let clock = 0;
    const guard = createTapGuard(() => clock, 700);
    let land: () => void = () => undefined;
    const slow = guard.run(() => new Promise<void>((resolve) => (land = resolve)));
    clock = 1500;
    land();
    await slow;
    clock = 1700;
    expect(guard.run(() => Promise.resolve())).toBeNull();
    clock = 2300;
    expect(guard.run(() => Promise.resolve())).not.toBeNull();
  });

  it("still guards after a failed action", async () => {
    let clock = 0;
    const guard = createTapGuard(() => clock, 700);
    await guard.run(() => Promise.reject(new Error("offline")))?.catch(() => undefined);
    clock = 100;
    expect(guard.run(() => Promise.resolve())).toBeNull();
  });
});
