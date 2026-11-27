import { describe, expect, it } from "vitest";
import { dayKey, fulfilmentLabel, weekStartKey } from "./format";
import { DanError } from "./errors";
import { english } from "./i18n";
import { GraphQLDanClient, pingServer } from "./graphql-client";
import { MockDanServer } from "./mock-server";
import { nextOnlineDraft } from "./online-drafts";
import { DEMO_EMAIL, DEMO_PASSWORD, DEMO_PIN, STAMP_GOAL } from "./seed";
import { normalizePersisted } from "./storage";
import { ticketSections } from "./ticket";
import { normalizeServerUrl } from "./url";
import { DEFAULT_STATIONS } from "./types";

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
    const byPin = await shop.login({ name: "amy", pin: DEMO_PIN });
    expect(byPin.token).toBeTruthy();
    await expect(shop.login({ name: "Amy", pin: "0000" })).rejects.toMatchObject({ code: "unauthorized" });
    await expect(shop.login({ name: "Nobody", pin: DEMO_PIN })).rejects.toMatchObject({ code: "unauthorized" });
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
    const sections = ticketSections(order, DEFAULT_STATIONS);
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

  it("keeps an eat-in order's table, tidied, and refuses a table name a link should not carry", async () => {
    const shop = server();
    const order = await shop.createOrder({ source: "online", fulfilment: "eat_in", table: "  Patio   2 ", lines: [{ number: 71, qty: 1 }] });
    expect(order).toMatchObject({ fulfilment: "eat_in", table: "Patio 2" });
    expect(fulfilmentLabel(order, english)).toBe("Eat in · Table Patio 2");
    expect(fulfilmentLabel({ fulfilment: "delivery" }, english)).toBe("Delivery");
    for (const table of ["<script>", "Table number twelve", "1;2"]) {
      await expect(
        shop.createOrder({ source: "online", fulfilment: "eat_in", table, lines: [{ number: 71, qty: 1 }] }),
      ).rejects.toMatchObject({ code: "bad_table" });
    }
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

describe("graphql client", () => {
  const shop = { id: "g", name: "Golden Dragon", nameZh: "金龍", address: "", city: "Watford", phone: "" };

  function answer(body: unknown, status = 200) {
    return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  }

  /** Records each request and replies with the next body. */
  function fake(...bodies: { body: unknown; status?: number }[]) {
    const seen: { url: string; headers: Record<string, string>; query: string; variables: Record<string, unknown> }[] = [];
    const fetchImpl = (input: RequestInfo | URL, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, unknown> };
      expect(init?.method).toBe("POST");
      seen.push({ url: String(input), headers: init?.headers as Record<string, string>, ...sent });
      const next = bodies.shift() ?? { body: {} };
      return answer(next.body, next.status);
    };
    return { fetchImpl, seen };
  }

  it("treats a refused connection as unreachable and a foreign page as not Dan", async () => {
    await expect(
      pingServer("http://192.168.1.20:2283", () => Promise.reject(new TypeError("failed to fetch"))),
    ).rejects.toMatchObject({ code: "unreachable" });

    const html = () =>
      Promise.resolve(new Response("<html>nope</html>", { status: 404, headers: { "content-type": "text/html" } }));
    await expect(pingServer("https://example.com", html)).rejects.toMatchObject({ code: "not_dan" });

    const otherGraphQL = fake({ body: { errors: [{ message: "Cannot query field ping" }] }, status: 400 });
    await expect(pingServer("https://example.com", otherGraphQL.fetchImpl)).rejects.toMatchObject({ code: "not_dan" });

    const wrongProduct = fake({ body: { data: { ping: { ok: true, product: "immich", version: "1", shop, auth: { password: true, pin: true } } } } });
    await expect(pingServer("https://example.com", wrongProduct.fetchImpl)).rejects.toMatchObject({ code: "not_dan" });
  });

  it("pings at /graphql, under a base path too, and says when a server is not set up", async () => {
    const ok = fake({ body: { data: { ping: { ok: true, product: "dan", version: "0.1.0", shop, auth: { password: true, pin: true } } } } });
    const ping = await pingServer("https://shop.example/dan/", ok.fetchImpl);
    expect(ok.seen[0].url).toBe("https://shop.example/dan/graphql");
    expect(ok.seen[0].query).toContain("ping");
    expect(ping.shop.name).toBe("Golden Dragon");

    const fresh = fake({ body: { data: null, errors: [{ message: "Run dan-server init.", extensions: { code: "not_set_up" } }] } });
    await expect(pingServer("http://192.168.1.20:2283", fresh.fetchImpl)).rejects.toMatchObject({ code: "not_set_up" });
  });

  it("signs in with the PIN alone, then sends the token", async () => {
    const { fetchImpl, seen } = fake(
      { body: { data: { login: { token: "tok", staff: { id: "counter", name: "Counter", role: "counter" }, shop } } } },
      { body: { data: { orders: [] } } },
    );
    const result = await new GraphQLDanClient("https://goldendragon.dan.partners", null, fetchImpl).login({ name: "Amy", pin: "2580" });
    expect(seen[0].url).toBe("https://goldendragon.dan.partners/graphql");
    expect(seen[0].variables).toEqual({ input: { name: "Amy", pin: "2580" } });
    expect(seen[0].headers.authorization).toBeUndefined();
    expect(result).toMatchObject({ token: "tok", staff: { role: "counter" } });

    await new GraphQLDanClient("https://goldendragon.dan.partners", result.token, fetchImpl).getOrders();
    expect(seen[1].headers.authorization).toBe("Bearer tok");
  });

  it("passes the server's error code through", async () => {
    const { fetchImpl } = fake(
      { body: { data: null, errors: [{ message: "Only the owner can do that.", extensions: { code: "forbidden" } }] } },
      { body: { errors: [{ message: "That request is too large.", extensions: { code: "too_large" } }] }, status: 413 },
      { body: { data: null, errors: [{ message: "Something odd" }] } },
    );
    const client = new GraphQLDanClient("http://192.168.1.20:2283", "tok", fetchImpl);
    await expect(client.getSales("today")).rejects.toEqual(new DanError("forbidden", "Only the owner can do that."));
    await expect(client.getSales("today")).rejects.toMatchObject({ code: "too_large" });
    await expect(client.getSales("today")).rejects.toMatchObject({ code: "bad_response" });
  });

  it("sends each operation's variables as the schema names them", async () => {
    const { fetchImpl, seen } = fake(
      { body: { data: { updateOrder: { id: "o1" } } } },
      { body: { data: { updateMenuItem: { id: "item-81" } } } },
      { body: { data: { customers: [] } } },
      { body: { data: { createOrder: { id: "o2" } } } },
    );
    const client = new GraphQLDanClient("http://192.168.1.20:2283", "tok", fetchImpl);
    await client.updateOrder("o1", { status: "ready" });
    await client.updateMenuItem("item-81", { soldOut: true });
    await client.getCustomers();
    await client.createOrder({ source: "counter", fulfilment: "collection", lines: [{ number: 81, qty: 2 }] });
    expect(seen[0].variables).toEqual({ id: "o1", status: "ready" });
    expect(seen[1].variables).toEqual({ id: "item-81", patch: { soldOut: true } });
    expect(seen[2].variables).toEqual({ phone: null });
    expect(seen[3].variables).toEqual({ input: { source: "counter", fulfilment: "collection", lines: [{ number: 81, qty: 2 }] } });
  });
  it("lets the owner build the menu: dishes and categories", async () => {
    const server = new MockDanServer();
    const drinks = await server.createCategory({ nameEn: " Drinks ", nameZh: "" });
    // One name given: used for both languages.
    expect(drinks).toMatchObject({ nameEn: "Drinks", nameZh: "Drinks" });
    await expect(server.createCategory({ nameEn: " ", nameZh: "" })).rejects.toMatchObject({ code: "invalid" });

    const cola = await server.createMenuItem({ number: 900, categoryId: drinks.id, nameEn: "Cola", nameZh: "", pricePence: 150 });
    expect(cola).toMatchObject({ nameEn: "Cola", nameZh: "Cola", station: "counter", kind: "item", soldOut: false });
    await expect(server.createMenuItem({ number: 900, categoryId: drinks.id, nameEn: "Lemonade", nameZh: "", pricePence: 150 })).rejects.toMatchObject({
      code: "duplicate_number",
    });
    await expect(server.createMenuItem({ number: 901, categoryId: "nowhere", nameEn: "Lemonade", nameZh: "", pricePence: 150 })).rejects.toMatchObject({
      code: "invalid",
    });

    // Renaming a dish with one name keeps one name; a second name is kept.
    const renamed = await server.updateMenuItem(cola.id, { nameEn: "Cola (can)", nameZh: "Cola" });
    expect(renamed.nameZh).toBe("Cola (can)");
    const bilingual = await server.updateMenuItem(cola.id, { nameZh: "可樂" });
    expect(bilingual).toMatchObject({ nameEn: "Cola (can)", nameZh: "可樂" });

    await expect(server.deleteCategory(drinks.id)).rejects.toMatchObject({ code: "category_not_empty" });
    await server.deleteMenuItem(cola.id);
    await expect(server.deleteMenuItem(cola.id)).rejects.toMatchObject({ code: "not_found" });
    await server.deleteCategory(drinks.id);
    expect((await server.getMenu()).categories.some((category) => category.id === drinks.id)).toBe(false);
  });

  it("keeps a dish that a set meal includes, and puts categories in a new order", async () => {
    const server = new MockDanServer();
    const menu = await server.getMenu();
    const set = menu.items.find((item) => item.kind === "set");
    expect(set).toBeDefined();
    const part = menu.items.find((item) => item.number === set!.includes[0].number)!;
    await expect(server.deleteMenuItem(part.id)).rejects.toMatchObject({ code: "in_a_set" });

    const ids = menu.categories.map((category) => category.id).reverse();
    const reordered = await server.reorderCategories(ids);
    expect(reordered.map((category) => category.id)).toEqual(ids);
    expect(reordered[0].sort).toBe(1);
    await expect(server.reorderCategories(ids.slice(1))).rejects.toMatchObject({ code: "invalid" });
  });

  it("changes the shop's details", async () => {
    const server = new MockDanServer();
    const saved = await server.updateShop({ name: " Golden  Dragon Two ", phone: "01923 000000" });
    expect(saved).toMatchObject({ name: "Golden Dragon Two", phone: "01923 000000" });
    expect((await server.ping()).shop.name).toBe("Golden Dragon Two");
    await expect(server.updateShop({ name: "  " })).rejects.toMatchObject({ code: "invalid" });
  });

  it("keeps the demo's staff, each with a name and PIN, and logs what is done (DAN-44)", async () => {
    const server = new MockDanServer();
    expect((await server.getStaff()).map((member) => member.name)).toEqual(["Amy", "Ben"]);
    await expect(server.addStaff("amy", "1111")).rejects.toMatchObject({ code: "staff_name_taken" });
    await expect(server.addStaff("Cat", "12")).rejects.toMatchObject({ code: "staff_pin" });
    await expect(server.addStaff("  ", "1234")).rejects.toMatchObject({ code: "staff_name" });
    const cat = await server.addStaff("  Cat  Lee ", "2468");
    expect(cat.name).toBe("Cat Lee");
    await expect(server.login({ name: "cat lee", pin: "2468" })).resolves.toBeTruthy();
    await server.setStaffPin(cat.id, "1357");
    await expect(server.login({ name: "Cat Lee", pin: "2468" })).rejects.toMatchObject({ code: "unauthorized" });
    await server.removeStaff(cat.id);
    await expect(server.login({ name: "Cat Lee", pin: "1357" })).rejects.toMatchObject({ code: "unauthorized" });
    const order = await server.createOrder({ source: "counter", fulfilment: "collection", lines: [{ number: 81, qty: 1 }] });
    expect(order.takenBy?.name).toBe("Mei");
    const log = await server.getActivity();
    expect(log.entries[0]).toMatchObject({ action: "order_taken", orderNumber: order.number, byName: "Mei" });
    expect(log.entries.map((entry) => entry.action)).toContain("addStaff");
  });
  it("lets the owner name the stations, and keeps one that dishes still use", async () => {
    const server = new MockDanServer();
    expect((await server.getStations()).map((station) => station.id)).toEqual(["wok", "fryer", "rice", "counter"]);

    const withBar = [...DEFAULT_STATIONS, { id: "bar", nameEn: " Bar ", nameZh: "" }];
    const saved = await server.updateStations(withBar);
    expect(saved[4]).toEqual({ id: "bar", nameEn: "Bar", nameZh: "Bar" });

    // A dish moves to the bar; then the bar cannot go until it moves off.
    const menu = await server.getMenu();
    const dish = menu.items.find((item) => item.number === 81)!;
    expect((await server.updateMenuItem(dish.id, { station: "bar" })).station).toBe("bar");
    await expect(server.updateMenuItem(dish.id, { station: "oven" })).rejects.toMatchObject({ code: "invalid" });
    await expect(server.updateStations(DEFAULT_STATIONS)).rejects.toMatchObject({ code: "station_in_use" });
    expect((await server.updateMenuItem(dish.id, { station: "" })).station).toBe("");
    expect(await server.updateStations(DEFAULT_STATIONS)).toHaveLength(4);

    await expect(server.updateStations([{ id: "Bad Id", nameEn: "X", nameZh: "" }])).rejects.toMatchObject({ code: "stations_ids" });
    await expect(server.updateStations([{ id: "x", nameEn: " ", nameZh: "" }])).rejects.toMatchObject({ code: "stations_name" });
    // Wok still has dishes, so the list cannot be emptied in the demo.
    await expect(server.updateStations([])).rejects.toMatchObject({ code: "station_in_use" });
  });
  it("keeps the owner's views in step with the board and their sounds", async () => {
    const server = new MockDanServer();
    expect((await server.getViews()).map((view) => view.id)).toEqual(["kitchen", "pass"]);
    const saved = await server.updateViews([
      ...(await server.getViews()),
      { id: "packing", nameEn: "Packing", nameZh: "", look: "make", columns: ["preparing"] },
    ]);
    expect(saved[2]).toMatchObject({ id: "packing", nameZh: "Packing", columns: ["preparing"] });
    await expect(server.updateViews([{ id: "counter", nameEn: "Counter", nameZh: "", look: "make", columns: [] }])).rejects.toMatchObject({ code: "views_ids" });

    // A sound on the new view; one that plays nowhere the shop has is refused.
    const chime = { id: "packing-chime", event: "ticket_enters_role" as const, column: null, role: "in_progress" as const, action: "play_sound" as const, sound: "chime" as const, enabled: true };
    await expect(server.updateTriggers({ triggers: [{ ...chime, views: ["nowhere"] }] })).rejects.toMatchObject({ code: "triggers_views" });
    await server.updateTriggers({ triggers: [...(await server.getTriggers()).triggers, { ...chime, views: ["packing"] }] });

    // A new in-progress column joins the views that showed the whole of that stage.
    const board = await server.getBoard();
    const columns = [...board.columns.slice(0, 2), { id: "plating", nameEn: "Plating", nameZh: "", role: "in_progress" as const, colour: "#7a4fd0" }, ...board.columns.slice(2)];
    await server.updateBoard({ columns }, false);
    const after = await server.getViews();
    expect(after[0].columns).toEqual(["new", "preparing", "plating", "ready"]);
    expect(after[2].columns).toEqual(["preparing", "plating"]);
    expect(after[1].columns).toEqual(["ready"]);

    // The packing view goes, and its sound with it.
    await server.updateViews(after.slice(0, 2));
    expect((await server.getTriggers()).triggers.map((trigger) => trigger.id)).toEqual(["kitchen-ding"]);
    expect((await server.resetViews()).map((view) => view.id)).toEqual(["kitchen", "pass"]);
  });
});
