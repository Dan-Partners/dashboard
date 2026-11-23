import { describe, expect, it } from "vitest";
import { dayKey, weekStartKey } from "./format";
import { DanError } from "./errors";
import { HttpDanClient, pingServer } from "./http-client";
import { MockDanServer } from "./mock-server";
import { nextOnlineDraft } from "./online-drafts";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_PIN, STAMP_GOAL } from "./seed";
import { normalizePersisted } from "./storage";
import { ticketSections } from "./ticket";
import { normalizeServerUrl } from "./url";

const now = new Date("2026-06-10T15:00:00.000Z");

function server() {
  return new MockDanServer({ now: () => now });
}

describe("server url", () => {
  it("accepts a bare shop address and a trailing slash", () => {
    expect(normalizeServerUrl("192.168.1.20:2283")).toBe("http://192.168.1.20:2283");
    expect(normalizeServerUrl("https://goldendragon.dan.partners/")).toBe("https://goldendragon.dan.partners");
  });

  it("rejects empty, non-http, and credentialed addresses", () => {
    expect(() => normalizeServerUrl("  ")).toThrow(DanError);
    expect(() => normalizeServerUrl("javascript:alert(1)")).toThrow(DanError);
    expect(() => normalizeServerUrl("https://user:secret@shop.example")).toThrow(DanError);
  });
});

describe("mock shop", () => {
  it("answers a Dan ping and signs in with the demo password or PIN", async () => {
    const shop = server();
    const ping = await shop.ping();
    expect(ping.product).toBe("dan");
    expect(ping.shop.name).toBe("Golden Dragon");
    expect(ping.shop.nameZh).toBe("金龍");

    const byPassword = await shop.login({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    expect(byPassword.staff.name).toBe("Mei");
    const byPin = await shop.login({ pin: DEMO_PIN });
    expect(byPin.token).toBeTruthy();
    await expect(shop.login({ pin: "0000" })).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("prices an order from the menu and refuses a sold-out dish", async () => {
    const shop = server();
    const order = await shop.createOrder({
      source: "counter",
      fulfilment: "collection",
      lines: [
        { number: 80, qty: 2 },
        { number: 100, qty: 1 },
      ],
    });
    expect(order.totalPence).toBe(310 * 2 + 150);
    expect(order.status).toBe("preparing");
    expect(order.number).toBe(1857);

    await expect(
      shop.createOrder({ source: "counter", fulfilment: "collection", lines: [{ number: 23, qty: 1 }] }),
    ).rejects.toMatchObject({ code: "sold_out" });
  });

  it("expands a set meal onto kitchen stations without charging the parts twice", async () => {
    const shop = server();
    const order = await shop.createOrder({
      source: "phone",
      fulfilment: "delivery",
      address: "8 Market Street, Watford",
      lines: [{ number: 201, qty: 1 }],
    });
    expect(order.totalPence).toBe(1240);
    const sections = ticketSections(order);
    const names = sections.flatMap((section) => section.lines.map((line) => line.number));
    expect(names).toEqual(expect.arrayContaining([25, 81, 2, 90]));
    expect(sections.map((section) => section.station)).toEqual(expect.arrayContaining(["wok", "fryer"]));
  });

  it("moves an order one step at a time", async () => {
    const shop = server();
    const created = await shop.createOrder({
      source: "online",
      fulfilment: "collection",
      lines: [{ number: 71, qty: 1 }],
    });
    expect(created.status).toBe("new");
    await expect(shop.updateOrder(created.id, { status: "ready" })).rejects.toMatchObject({ code: "bad_status" });
    const preparing = await shop.updateOrder(created.id, { status: "preparing" });
    expect(preparing.status).toBe("preparing");
  });

  it("fills a stamp card and then asks for the reward to be redeemed", async () => {
    const shop = server();
    const office = (await shop.getCustomers({ phone: "01923 555014" })).customers[0];
    expect(office.stamps).toBe(STAMP_GOAL);
    await expect(shop.addStamp(office.phone)).rejects.toMatchObject({ code: "reward_pending" });
    const redeemed = await shop.redeemReward(office.phone);
    expect(redeemed.stamps).toBe(0);
    expect(redeemed.rewardsRedeemed).toBe(2);

    const stamped = await shop.addStamp("07700 900441");
    expect(stamped.stamps).toBe(8);
  });

  it("keeps today's takings inside the London day and the Monday week", async () => {
    const shop = server();
    const today = await shop.getSales("today");
    const week = await shop.getSales("week");
    const orders = (await shop.getOrders()).orders;
    const todayOrders = orders.filter((order) => dayKey(new Date(order.createdAt)) === dayKey(now));
    const weekOrders = orders.filter((order) => {
      const key = dayKey(new Date(order.createdAt));
      return key >= weekStartKey(now) && key <= dayKey(now);
    });

    expect(today.orderCount).toBe(todayOrders.length);
    expect(today.totalPence).toBe(todayOrders.reduce((sum, order) => sum + order.totalPence, 0));
    expect(week.orderCount).toBe(weekOrders.length);
    expect(week.orderCount).toBeGreaterThan(today.orderCount);
    expect(week.orderCount).toBeLessThan(orders.length);
    expect(today.topItems.length).toBeGreaterThan(0);
  });

  it("round-trips demo state and can mark a dish sold out", async () => {
    const shop = server();
    const menu = await shop.getMenu();
    const rice = menu.items.find((item) => item.number === 80);
    expect(rice).toBeTruthy();
    const updated = await shop.updateMenuItem(rice!.id, { soldOut: true, pricePence: 330 });
    expect(updated.soldOut).toBe(true);
    expect(updated.pricePence).toBe(330);

    const restored = new MockDanServer({ state: shop.getState(), now: () => now });
    const again = await restored.getMenu();
    expect(again.items.find((item) => item.number === 80)?.soldOut).toBe(true);
    expect(normalizePersisted({ version: 1, demoState: shop.getState() }).demoState?.orders.length).toBe(
      shop.getState().orders.length,
    );
  });

  it("skips online drafts that include a sold-out dish", () => {
    const state = server().getState();
    const draft = nextOnlineDraft(state, () => 0.5);
    expect(draft).toBeTruthy();
    expect(draft!.lines.some((line) => line.number === 23)).toBe(false);
  });
});

describe("http client", () => {
  it("treats a refused connection as unreachable and a foreign page as not Dan", async () => {
    await expect(
      pingServer("http://192.168.1.20:2283", () => Promise.reject(new TypeError("failed to fetch"))),
    ).rejects.toMatchObject({ code: "unreachable" });

    const fetchImpl = () =>
      Promise.resolve(
        new Response("<html>nope</html>", { status: 404, headers: { "content-type": "text/html" } }),
      );
    await expect(pingServer("https://example.com", fetchImpl)).rejects.toMatchObject({ code: "not_dan" });
  });

  it("posts login to the shop server", async () => {
    let seen = "";
    const fetchImpl = (input: RequestInfo | URL, init?: RequestInit) => {
      seen = String(input);
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(JSON.stringify({ pin: "2580" }));
      return Promise.resolve(
        new Response(JSON.stringify({ token: "tok", staff: { id: "mei", name: "Mei", role: "owner" }, shop: { id: "g", name: "Golden Dragon", nameZh: "金龍", address: "", city: "Watford", phone: "" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    };
    const client = new HttpDanClient("https://goldendragon.dan.partners", null, fetchImpl);
    const result = await client.login({ pin: "2580" });
    expect(seen).toBe("https://goldendragon.dan.partners/api/auth/login");
    expect(result.token).toBe("tok");
  });
});
