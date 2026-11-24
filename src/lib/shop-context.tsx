"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { demoMutate, enterDemo, resetDemo } from "./demo-runtime";
import { DanError, isDanError } from "./errors";
import { formatPence } from "./format";
import { summarizeSales } from "./sales";
import { GraphQLDanClient, ORDER_FIELDS } from "./graphql-client";
import { live } from "./live";
import type { ThemeChoice } from "./theme";
import { editingThemeNow } from "./use-theme";
import { nextOnlineDraft } from "./online-drafts";
import {
  forgetServer,
  getServerSnapshot,
  getSnapshot,
  rememberServer,
  subscribe,
  writePersisted,
  type Persisted,
} from "./storage";
import type {
  CreateOrderInput,
  Customer,
  LoginInput,
  MenuItemPatch,
  Order,
  OrderStatus,
  SalesRange,
  SalesSummary,
  ServerPing,
  ShopSnapshot,
} from "./types";

export type Notice = {
  id: string;
  title: string;
  detail: string;
  href?: string;
};

type ShopContextValue = {
  ready: boolean;
  persisted: Persisted;
  snapshot: ShopSnapshot | null;
  remoteError: string | null;
  notice: Notice | null;
  dismissNotice: () => void;
  rememberServer: (url: string) => void;
  forgetServer: (url: string) => void;
  loginRemote: (baseUrl: string, input: LoginInput, ping: ServerPing) => Promise<void>;
  enterDemo: () => void;
  logout: () => void;
  resetDemo: () => void;
  updateItem: (id: string, patch: MenuItemPatch) => Promise<void>;
  placeOrder: (input: CreateOrderInput) => Promise<Order>;
  setOrderStatus: (id: string, status: OrderStatus) => Promise<void>;
  createCustomer: (input: { phone: string; name: string }) => Promise<Customer>;
  addStamp: (phone: string) => Promise<Customer>;
  redeemReward: (phone: string) => Promise<Customer>;
  loadSales: (range: SalesRange) => Promise<SalesSummary>;
  setActiveOrderId: (id: string | null) => void;
  retryRemote: () => Promise<void>;
};

const ShopContext = createContext<ShopContextValue | null>(null);

function useReady() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function snapshotFromPersisted(persisted: Persisted): ShopSnapshot | null {
  if (persisted.session?.mode !== "demo" || !persisted.demoState) return null;
  const state = persisted.demoState;
  return {
    shop: state.shop,
    categories: state.categories,
    items: state.items,
    orders: state.orders,
    customers: state.customers,
  };
}

async function pullRemote(baseUrl: string, token: string): Promise<Omit<ShopSnapshot, "shop"> & { theme: ThemeChoice }> {
  const client = new GraphQLDanClient(baseUrl, token);
  const [menu, orders, customers, theme] = await Promise.all([
    client.getMenu(),
    client.getOrders(),
    client.getCustomers(),
    client.getTheme(),
  ]);
  return {
    categories: menu.categories,
    items: menu.items,
    orders: orders.orders,
    customers: customers.customers,
    theme,
  };
}

/** What the shop server's live channel sends. */
type ShopEvent = { kind: "order" | "menu" | "customers" | "theme" | "resync"; order: Order | null };

const SHOP_EVENTS = `subscription ShopEvents { shopEvents { kind order { ${ORDER_FIELDS} } } }`;

/** The orders currently on the board, read outside React. */
let remoteOrders: Order[] = [];
function getRemoteOrders() {
  return remoteOrders;
}

/** Takes the shop's theme from the server, unless the owner is editing it on this tablet. */
function adoptShopTheme(theme: ThemeChoice | undefined) {
  if (!theme || editingThemeNow()) return;
  if (JSON.stringify(theme) !== JSON.stringify(getSnapshot().theme)) writePersisted({ theme });
}

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const persisted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useReady();
  const [remote, setRemote] = useState<ShopSnapshot | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const session = ready ? persisted.session : null;

  const refreshRemote = useCallback(async () => {
    const current = getSnapshot().session;
    if (current?.mode !== "remote" || !current.serverUrl || !current.token) return;
    try {
      const { theme, ...next } = await pullRemote(current.serverUrl, current.token);
      adoptShopTheme(theme);
      remoteOrders = next.orders;
      setRemote({ ...next, shop: current.shop });
      setRemoteError(null);
    } catch (error) {
      if (isDanError(error) && error.code === "unauthorized") {
        writePersisted({ session: null });
        setRemote(null);
        return;
      }
      setRemoteError(error instanceof Error ? error.message : "The shop server stopped answering.");
      throw error;
    }
  }, []);

  /*
   * The shop server's live channel. Each (re)connection fetches everything
   * once, so nothing is missed while it was down. After that, an order change
   * arrives in full and is put on the board; a menu, stamp card or theme
   * notice fetches just that part. Nothing polls.
   */
  const liveMode = session?.mode;
  const liveServer = session?.serverUrl;
  const liveToken = session?.token;
  useEffect(() => {
    if (!ready || liveMode !== "remote" || !liveServer || !liveToken) return;
    const serverUrl = liveServer;
    const token = liveToken;
    const client = new GraphQLDanClient(serverUrl, token);
    const seen = new Set<string>();
    let first = true;
    const stop = live<{ shopEvents: ShopEvent }>({
      base: serverUrl,
      payload: { token },
      query: SHOP_EVENTS,
      onOpen: () => {
        void refreshRemote()
          .then(() => {
            // Orders already on the board when the channel opens are not news.
            if (first) for (const order of getRemoteOrders()) seen.add(order.id);
            first = false;
          })
          .catch(() => undefined);
      },
      onStatus: (status) => {
        if (status === "offline") setRemoteError("offline");
        if (status === "live") setRemoteError(null);
      },
      onRefused: (code) => {
        if (code === "unauthorized") {
          writePersisted({ session: null });
          setRemote(null);
        }
      },
      onData: ({ shopEvents: event }) => {
        if (event.kind === "order" && event.order) {
          const order = event.order;
          setRemote((current) => {
            if (!current) return current;
            const others = current.orders.filter((entry) => entry.id !== order.id);
            return { ...current, orders: [order, ...others] };
          });
          if (order.source === "online" && order.status === "new" && !seen.has(order.id)) {
            setNotice({
              id: order.id,
              title: `#${order.number}`,
              detail: `${order.fulfilment === "delivery" ? "Delivery" : "Collection"} · ${formatPence(order.totalPence)}`,
              href: `/shop/ticket?order=${order.id}`,
            });
          }
          seen.add(order.id);
        } else if (event.kind === "menu") {
          void client.getMenu().then((menu) => setRemote((current) => (current ? { ...current, ...menu } : current))).catch(() => undefined);
        } else if (event.kind === "customers") {
          void client
            .getCustomers()
            .then(({ customers }) => setRemote((current) => (current ? { ...current, customers } : current)))
            .catch(() => undefined);
        } else if (event.kind === "theme") {
          void client.getTheme().then(adoptShopTheme).catch(() => undefined);
        } else {
          void refreshRemote().catch(() => undefined);
        }
      },
    });
    return stop;
  }, [ready, liveMode, liveServer, liveToken, refreshRemote]);

  useEffect(() => {
    if (!ready || session?.mode !== "demo") return;
    let cancelled = false;
    let timer = 0;
    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        if (document.visibilityState === "visible") {
          void demoMutate((server) => {
            const draft = nextOnlineDraft(server.getState());
            if (!draft) throw new Error("quiet");
            return server.createOrder(draft);
          })
            .then((order) => {
              if (cancelled) return;
              const where = order.fulfilment === "delivery" ? "Delivery" : "Collection";
              setNotice({
                id: order.id,
                title: `#${order.number}`,
                detail: `${where} · ${formatPence(order.totalPence)}`,
                href: `/shop/ticket?order=${order.id}`,
              });
            })
            .catch(() => undefined);
        }
        schedule(34000);
      }, delay);
    };
    schedule(22000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ready, session?.mode]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    document.documentElement.dataset.dan = "ready";
    return () => {
      delete document.documentElement.dataset.dan;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = persisted.locale === "zh-Hant" ? "zh-Hant" : "en";
  }, [ready, persisted.locale]);

  const snapshot = session?.mode === "demo" ? snapshotFromPersisted(persisted) : session?.mode === "remote" ? remote : null;

  const value = useMemo<ShopContextValue>(() => {
    return {
      ready,
      persisted,
      snapshot,
      remoteError,
      notice,
      dismissNotice: () => setNotice(null),
      rememberServer,
      forgetServer,
      async loginRemote(baseUrl, input, ping) {
        const client = new GraphQLDanClient(baseUrl);
        const result = await client.login(input);
        writePersisted({
          session: {
            mode: "remote",
            serverUrl: baseUrl,
            token: result.token,
            shop: result.shop ?? ping.shop,
            staff: result.staff,
          },
        });
        adoptShopTheme(ping.theme);
        const authed = new GraphQLDanClient(baseUrl, result.token);
        const [menu, orders, customers] = await Promise.all([
          authed.getMenu(),
          authed.getOrders(),
          authed.getCustomers(),
        ]);
        setRemote({
          shop: result.shop ?? ping.shop,
          categories: menu.categories,
          items: menu.items,
          orders: orders.orders,
          customers: customers.customers,
        });
        setRemoteError(null);
      },
      enterDemo() {
        enterDemo();
        setRemote(null);
        setRemoteError(null);
      },
      logout() {
        const current = getSnapshot().session;
        if (current?.mode === "remote" && current.serverUrl && current.token) {
          void new GraphQLDanClient(current.serverUrl, current.token).logout().catch(() => undefined);
        }
        writePersisted({ session: null });
        setRemote(null);
      },
      resetDemo() {
        resetDemo();
        setNotice(null);
      },
      async updateItem(id, patch) {
        if (getSnapshot().session?.mode === "demo") {
          await demoMutate((server) => server.updateMenuItem(id, patch));
          return;
        }
        const current = getSnapshot().session;
        if (!current?.serverUrl || !current.token) return;
        await new GraphQLDanClient(current.serverUrl, current.token).updateMenuItem(id, patch);
        await refreshRemote();
      },
      async placeOrder(input) {
        if (getSnapshot().session?.mode === "demo") {
          const order = await demoMutate((server) => server.createOrder(input));
          writePersisted({ activeOrderId: order.id });
          return order;
        }
        const current = getSnapshot().session;
        if (!current?.serverUrl || !current.token) {
          throw new Error("Sign in first.");
        }
        const order = await new GraphQLDanClient(current.serverUrl, current.token).createOrder(input);
        writePersisted({ activeOrderId: order.id });
        await refreshRemote();
        return order;
      },
      async setOrderStatus(id, status) {
        if (getSnapshot().session?.mode === "demo") {
          await demoMutate((server) => server.updateOrder(id, { status }));
          return;
        }
        const current = getSnapshot().session;
        if (!current?.serverUrl || !current.token) return;
        await new GraphQLDanClient(current.serverUrl, current.token).updateOrder(id, { status });
        await refreshRemote();
      },
      async createCustomer(input) {
        if (getSnapshot().session?.mode === "demo") {
          return demoMutate((server) => server.createCustomer(input));
        }
        const current = getSnapshot().session;
        if (!current?.serverUrl || !current.token) throw new Error("Sign in first.");
        const customer = await new GraphQLDanClient(current.serverUrl, current.token).createCustomer(input);
        await refreshRemote();
        return customer;
      },
      async addStamp(phone) {
        if (getSnapshot().session?.mode === "demo") {
          return demoMutate((server) => server.addStamp(phone));
        }
        const current = getSnapshot().session;
        if (!current?.serverUrl || !current.token) throw new Error("Sign in first.");
        const customer = await new GraphQLDanClient(current.serverUrl, current.token).addStamp(phone);
        await refreshRemote();
        return customer;
      },
      async redeemReward(phone) {
        if (getSnapshot().session?.mode === "demo") {
          return demoMutate((server) => server.redeemReward(phone));
        }
        const current = getSnapshot().session;
        if (!current?.serverUrl || !current.token) throw new Error("Sign in first.");
        const customer = await new GraphQLDanClient(current.serverUrl, current.token).redeemReward(phone);
        await refreshRemote();
        return customer;
      },
      async loadSales(range) {
        if (getSnapshot().session?.mode === "demo") {
          const state = getSnapshot().demoState;
          if (!state) throw new DanError("no_demo", "Demo is not running.");
          return summarizeSales(state.orders, range, new Date());
        }
        const current = getSnapshot().session;
        if (!current?.serverUrl || !current.token) throw new Error("Sign in first.");
        return new GraphQLDanClient(current.serverUrl, current.token).getSales(range);
      },
      setActiveOrderId(id) {
        writePersisted({ activeOrderId: id });
      },
      retryRemote() {
        return refreshRemote();
      },
    };
  }, [notice, persisted, ready, refreshRemote, remoteError, snapshot]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const value = useContext(ShopContext);
  if (!value) throw new Error("useShop must be used inside ShopProvider");
  return value;
}

/**
 * True when the owner is signed in. The counter PIN runs service but cannot
 * change the menu or see sales; the shop server enforces this, and screens
 * use this to hide what a PIN user cannot do. The demo signs in as the owner.
 */
export function useIsOwner(): boolean {
  const { ready, persisted } = useShop();
  return ready && persisted.session?.staff.role === "owner";
}

export function useSessionRedirect(destination: "home" | "shop") {
  const { ready, persisted } = useShop();
  const router = useRouter();
  const session = ready ? persisted.session : null;
  useEffect(() => {
    if (!ready) return;
    if (destination === "home" && !session) router.replace("/");
    if (destination === "shop" && session) router.replace("/shop/orders");
  }, [destination, ready, router, session]);
  return { ready, session };
}
