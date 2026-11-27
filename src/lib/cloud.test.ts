import { describe, expect, it } from "vitest";
import { addressNameFrom, cloudLogin, cloudPinLogin, joinWaitlist, linkToken } from "./cloud";

const base = "https://cloud.test";

function answering(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    seen.url = String(url);
    seen.init = init;
    return new Response(body === undefined ? "" : JSON.stringify(body), { status });
  }) as typeof fetch;
}

const signedIn = {
  token: "dst_0123456789abcdef_t",
  shopAddress: "https://corner-bakery.shops.test",
  staff: { id: "owner", name: "Mei", role: "owner" },
  shop: { id: "corner-bakery", name: "Corner Bakery", nameZh: "", address: "", city: "", phone: "", addressName: "corner-bakery" },
};

describe("the Dan cloud's account calls, at its one address (DAN-43)", () => {
  it("signs in over GraphQL and keeps the cloud, the shop's address name and its own address", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const session = await cloudLogin("mei@example.com", "three small words", { base, fetchImpl: answering(200, { data: { signIn: signedIn } }, seen) });
    expect(seen.url).toBe("https://cloud.test/graphql");
    const sent = JSON.parse(String(seen.init?.body));
    expect(sent.query).toContain("signIn(email: $email, password: $password, shop: $shop)");
    expect(sent.variables).toEqual({ email: "mei@example.com", password: "three small words", shop: null });
    expect(session).toMatchObject({
      token: "dst_0123456789abcdef_t",
      cloudUrl: "https://cloud.test",
      addressName: "corner-bakery",
      shopAddress: "https://corner-bakery.shops.test",
      shop: { name: "Corner Bakery" },
    });
    expect(session.shop).not.toHaveProperty("addressName");
  });

  it("signs the counter in by the shop's address name, whatever the capitals", async () => {
    const seen: { init?: RequestInit } = {};
    await cloudPinLogin(" Corner-Bakery ", "2468", { base, fetchImpl: answering(200, { data: { signInStaff: { ...signedIn, staff: { id: "counter", name: "Counter", role: "counter" } } } }, seen) });
    expect(JSON.parse(String(seen.init?.body)).variables).toEqual({ shop: "corner-bakery", pin: "2468" });
  });

  it("turns the cloud's refusals into errors with their code", async () => {
    const refused = (code: string) => answering(200, { data: null, errors: [{ message: "No.", extensions: { code } }] });
    await expect(cloudLogin("mei@example.com", "wrong", { base, fetchImpl: refused("unauthorized") })).rejects.toMatchObject({ code: "unauthorized" });
    await expect(joinWaitlist("x@example.com", { base, fetchImpl: refused("rate_limited") })).rejects.toMatchObject({ code: "rate_limited" });
    await expect(cloudPinLogin("nowhere", "2468", { base, fetchImpl: refused("not_found") })).rejects.toMatchObject({ code: "not_found" });
  });

  it("says so when the cloud cannot be reached, or answers with something else", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(joinWaitlist("x@example.com", { base, fetchImpl: down })).rejects.toMatchObject({ code: "cloud_unreachable" });
    await expect(cloudLogin("x@example.com", "p", { base, fetchImpl: answering(200, { data: { signIn: { token: "t" } } }) })).rejects.toMatchObject({ code: "bad_response" });
    await expect(cloudLogin("x@example.com", "p", { base, fetchImpl: answering(200, undefined) })).rejects.toMatchObject({ code: "bad_response" });
  });
});

describe("address names and link tokens", () => {
  it("makes an address name from a shop's name", () => {
    expect(addressNameFrom("Corner Bakery")).toBe("corner-bakery");
    expect(addressNameFrom("  Café  Olé! ")).toBe("cafe-ole");
    expect(addressNameFrom("金龍")).toBe("");
    expect(addressNameFrom("A".repeat(60))).toHaveLength(40);
  });

  it("reads a token only when it is a whole one", () => {
    const token = "a1".repeat(32);
    expect(linkToken(`#${token}`)).toBe(token);
    expect(linkToken(token)).toBe(token);
    expect(linkToken("#a1")).toBeNull();
    expect(linkToken(`#${"A1".repeat(32)}`)).toBeNull();
    expect(linkToken("")).toBeNull();
  });
});
