import { describe, expect, it } from "vitest";
import { BACK_ANYWAY_AFTER, linkFrom, serverInUse, type Health } from "./server-links";

describe("server lights", () => {
  it("go from checking to connected, then reconnecting, then offline after three misses", () => {
    expect(linkFrom(0, false)).toBe("checking");
    expect(linkFrom(0, true)).toBe("connected");
    expect(linkFrom(1, true)).toBe("reconnecting");
    expect(linkFrom(2, true)).toBe("reconnecting");
    expect(linkFrom(3, true)).toBe("offline");
  });
});

const healthy: Health = {
  shopMisses: 0,
  shopGood: 5,
  cloudUp: true,
  cloudSignedIn: true,
  sync: { mode: "synced", pending: 0, lastSyncedAt: "2026-11-25T12:00:00Z" },
};
const shopDown = (misses: number): Health => ({ ...healthy, shopMisses: misses, shopGood: 0, sync: null });

describe("switching servers", () => {
  it("stays on the shop server while it answers", () => {
    expect(serverInUse("shop", healthy)).toBe("shop");
  });

  it("stays on the shop server for two missed checks, then moves to the cloud on the third", () => {
    expect(serverInUse("shop", shopDown(1))).toBe("shop");
    expect(serverInUse("shop", shopDown(2))).toBe("shop");
    expect(serverInUse("shop", shopDown(3))).toBe("cloud");
  });

  it("never moves to a cloud that is not answering or not signed in to", () => {
    expect(serverInUse("shop", { ...shopDown(5), cloudUp: false })).toBe("shop");
    expect(serverInUse("shop", { ...shopDown(5), cloudSignedIn: false })).toBe("shop");
  });

  it("goes back after two good checks once the shop server has caught up", () => {
    const back = { ...healthy, shopGood: 1 };
    expect(serverInUse("cloud", shopDown(4))).toBe("cloud");
    expect(serverInUse("cloud", back)).toBe("cloud");
    expect(serverInUse("cloud", { ...back, shopGood: 2 })).toBe("shop");
  });

  it("waits for the shop server to fetch the cloud's orders before going back", () => {
    const behind: Health = { ...healthy, shopGood: 2, sync: { mode: "waiting", pending: 3, lastSyncedAt: null } };
    expect(serverInUse("cloud", behind)).toBe("cloud");
    expect(serverInUse("cloud", { ...behind, shopGood: BACK_ANYWAY_AFTER })).toBe("shop");
    expect(serverInUse("cloud", { ...behind, cloudUp: false })).toBe("shop");
  });

  it("goes back to the shop server if the cloud sign-in is lost", () => {
    expect(serverInUse("cloud", { ...shopDown(4), cloudSignedIn: false })).toBe("shop");
  });
});
