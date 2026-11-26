import { describe, expect, it } from "vitest";
import { addressNameFrom, cloudLogin, findShop, joinWaitlist, linkToken } from "./cloud";

const base = "https://cloud.test";

function answering(status: number, body: unknown, seen: { url?: string; init?: RequestInit } = {}): typeof fetch {
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    seen.url = String(url);
    seen.init = init;
    return new Response(body === undefined ? "" : JSON.stringify(body), { status });
  }) as typeof fetch;
}

describe("the Dan cloud's account calls", () => {
  it("signs in and keeps where the shop's staff API is", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const session = await cloudLogin("mei@example.com", "three small words", {
      base,
      fetchImpl: answering(
        200,
        { token: "t", staff: { id: "owner", name: "Mei", role: "owner" }, shop: { id: "b", name: "Corner Bakery" }, staffUrl: "https://corner-bakery.shops.test/staff", addressName: "corner-bakery" },
        seen,
      ),
    });
    expect(session.staffUrl).toBe("https://corner-bakery.shops.test/staff");
    expect(seen.url).toBe("https://cloud.test/v1/login");
    expect(JSON.parse(String(seen.init?.body))).toEqual({ email: "mei@example.com", password: "three small words" });
  });

  it("turns the cloud's refusals into errors with their code", async () => {
    await expect(
      cloudLogin("mei@example.com", "wrong", { base, fetchImpl: answering(401, { error: { code: "unauthorized", message: "That email or password is not right." } }) }),
    ).rejects.toMatchObject({ code: "unauthorized" });
    await expect(joinWaitlist("x@example.com", { base, fetchImpl: answering(429, { error: { code: "rate_limited", message: "Too many tries." } }) })).rejects.toMatchObject({
      code: "rate_limited",
    });
  });

  it("says so when the cloud cannot be reached, or answers with something else", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(joinWaitlist("x@example.com", { base, fetchImpl: down })).rejects.toMatchObject({ code: "cloud_unreachable" });
    await expect(cloudLogin("x@example.com", "p", { base, fetchImpl: answering(200, { token: "t" }) })).rejects.toMatchObject({ code: "bad_response" });
    await expect(cloudLogin("x@example.com", "p", { base, fetchImpl: answering(200, undefined) })).rejects.toMatchObject({ code: "bad_response" });
  });

  it("looks a shop up by its address name, whatever the capitals", async () => {
    const seen: { url?: string } = {};
    await findShop(" Corner-Bakery ", { base, fetchImpl: answering(200, { name: "Corner Bakery", addressName: "corner-bakery", staffUrl: "https://x/staff" }, seen) });
    expect(seen.url).toBe("https://cloud.test/v1/shops/corner-bakery");
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
