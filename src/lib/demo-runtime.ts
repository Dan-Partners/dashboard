import { DanError } from "./errors";
import { MockDanServer } from "./mock-server";
import { getSnapshot, writePersisted } from "./storage";
import type { Session } from "./types";

export async function demoMutate<T>(fn: (server: MockDanServer) => T | Promise<T>): Promise<T> {
  const state = getSnapshot().demoState;
  if (!state) throw new DanError("no_demo", "Demo is not running.");
  const server = new MockDanServer({ state });
  const result = await fn(server);
  writePersisted({ demoState: server.getState() });
  return result;
}

export function enterDemo() {
  const existing = getSnapshot().demoState;
  const server = new MockDanServer(existing ? { state: existing } : undefined);
  const login = server.demoSession();
  const session: Session = {
    mode: "demo",
    serverUrl: null,
    token: login.token,
    shop: login.shop,
    staff: login.staff,
  };
  writePersisted({ session, demoState: server.getState() });
}

export function resetDemo() {
  const server = new MockDanServer();
  const current = getSnapshot().session;
  const login = server.demoSession();
  writePersisted({
    demoState: server.getState(),
    activeOrderId: null,
    session:
      current?.mode === "demo"
        ? { mode: "demo", serverUrl: null, token: login.token, shop: login.shop, staff: login.staff }
        : current,
  });
}
