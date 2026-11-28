import { describe, expect, it } from "vitest";
import { GraphQLDanClient } from "./graphql-client";

/** A shop server that knows only some of the sync status fields. */
function server(knows: string[]) {
  const asked: string[] = [];
  const fetchImpl = (_input: RequestInfo | URL, init?: RequestInit) => {
    const { query } = JSON.parse(String(init?.body)) as { query: string };
    asked.push(query);
    const fields = query.replace(/.*syncStatus \{ /, "").replace(/ \}.*/, "").split(" ");
    const unknown = fields.find((field) => !knows.includes(field));
    const body = unknown
      ? { errors: [{ message: `Unknown field "${unknown}" on type "SyncStatus".` }] }
      : { data: { syncStatus: Object.fromEntries(fields.map((field) => [field, field === "version" ? "0.1.0" : field === "latestVersion" ? "0.2.0" : field === "updateAvailable" ? true : field === "mode" ? "synced" : null])) } };
    return Promise.resolve(new Response(JSON.stringify(body), { status: unknown ? 400 : 200, headers: { "content-type": "application/json" } }));
  };
  return { client: new GraphQLDanClient("http://192.168.1.20:2283", "token", fetchImpl as typeof fetch), asked };
}

describe("the sync status (DAN-49)", () => {
  it("says the shop server's version and whether a newer one is published", async () => {
    const { client } = server(["mode", "pending", "lastSyncedAt", "connected", "version", "latestVersion", "updateAvailable", "updateRequired"]);
    expect(await client.getSyncStatus()).toMatchObject({ version: "0.1.0", latestVersion: "0.2.0", updateAvailable: true });
  });

  it("asks an older shop server without the versions, and the oldest without connected", async () => {
    const before49 = server(["mode", "pending", "lastSyncedAt", "connected"]);
    expect((await before49.client.getSyncStatus()).version).toBeUndefined();
    expect(before49.asked).toHaveLength(2);
    const before34 = server(["mode", "pending", "lastSyncedAt"]);
    expect((await before34.client.getSyncStatus()).mode).toBe("synced");
    expect(before34.asked).toHaveLength(3);
  });
});
