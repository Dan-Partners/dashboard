import { afterEach, describe, expect, it, vi } from "vitest";
import { GraphQLDanClient } from "./graphql-client";

const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("a shop server from before dish photos", () => {
  it("still gives the menu: asked again without the photo field", async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const { query } = JSON.parse(String(init.body)) as { query: string };
        asked.push(query);
        if (query.includes("photo")) {
          return reply({ data: null, errors: [{ message: 'Unknown field "photo" on type "MenuItem".' }] });
        }
        return reply({ data: { menu: { categories: [], items: [{ id: "item-81", number: 81 }] } } });
      }),
    );
    const menu = await new GraphQLDanClient("http://shop.test", "token").getMenu();
    expect(menu.items[0].id).toBe("item-81");
    expect(asked).toHaveLength(2);
    expect(asked[1]).not.toContain("photo");
  });

  it("still saves a dish, once", async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const { query } = JSON.parse(String(init.body)) as { query: string };
        asked.push(query);
        if (query.includes("photo")) return reply({ data: null, errors: [{ message: 'Unknown field "photo" on type "MenuItem".' }] });
        return reply({ data: { updateMenuItem: { id: "item-81", soldOut: true } } });
      }),
    );
    const saved = await new GraphQLDanClient("http://shop.test", "token").updateMenuItem("item-81", { soldOut: true });
    expect(saved.id).toBe("item-81");
    expect(asked.filter((query) => !query.includes("photo"))).toHaveLength(1);
  });
});

describe("a shop server from before Uber couriers", () => {
  it("still gives the board, with delivery fees, asked again without the courier", async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const { query } = JSON.parse(String(init.body)) as { query: string };
        asked.push(query);
        if (query.includes("courier")) return reply({ data: null, errors: [{ message: 'Unknown field "courier" on type "Order".' }] });
        return reply({ data: { orders: [{ id: "o1", deliveryBy: "shop" }] } });
      }),
    );
    const { orders } = await new GraphQLDanClient("http://shop.test", "token").getOrders();
    expect(orders[0].deliveryBy).toBe("shop");
    expect(asked).toHaveLength(2);
    expect(asked[1]).toContain("deliveryBy");
    expect(asked[1]).not.toContain("courier");
  });

  it("says Uber is not connected rather than failing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply({ data: null, errors: [{ message: 'Unknown field "uberOptions" on type "Query".' }] })),
    );
    const options = await new GraphQLDanClient("http://shop.test", "token").getUberOptions();
    expect(options.connected).toBe(false);
  });
});
