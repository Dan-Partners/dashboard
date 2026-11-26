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

describe("a shop server from before board columns", () => {
  it("gives the board without columns, and the four default columns", async () => {
    vi.resetModules();
    const { GraphQLDanClient: Fresh } = await import("./graphql-client");
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const { query } = JSON.parse(String(init.body)) as { query: string };
        asked.push(query);
        if (/\bcolumn(At|Remap)?\b/.test(query) || query.includes("board")) {
          return reply({ data: null, errors: [{ message: 'Unknown field "column" on type "Order".' }] });
        }
        return reply({ data: { orders: [{ id: "o1", courier: null }] } });
      }),
    );
    const client = new Fresh("http://shop.test", "token");
    const { orders } = await client.getOrders();
    expect(orders[0].id).toBe("o1");
    expect(asked.at(-1)).toContain("courier");
    expect((await client.getBoard()).columns.map((column) => column.id)).toEqual(["new", "preparing", "ready", "completed"]);
  });
});

describe("a shop server from before Uber couriers", () => {
  it("still gives the board, with delivery fees, asked again without the courier", async () => {
    vi.resetModules();
    const { GraphQLDanClient } = await import("./graphql-client");
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
    // Asked with board columns, then with couriers, then with neither.
    expect(asked).toHaveLength(3);
    expect(asked[2]).toContain("deliveryBy");
    expect(asked[2]).not.toContain("courier");
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
