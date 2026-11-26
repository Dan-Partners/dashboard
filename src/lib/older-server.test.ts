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
