"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { demoMutate, enterDemo, resetDemo } from "./demo-runtime";
import { DanError, isDanError } from "./errors";
import { formatPence, fulfilmentLabel, orderLabel } from "./format";
import { english } from "./i18n";
import { summarizeSales } from "./sales";
import { historyPage, type OrderHistoryFilter, type OrderPage } from "./history";
import type { OrderEdit, OrderEditInput } from "./order-edit";
import { GraphQLDanClient, orderFields, pingServer, uploadMenuPhoto, type CourierAction } from "./graphql-client";
import { shrinkPhoto } from "./photos";
import { expectMine, noteBoard, seeOrder } from "./arrivals";
import { normalizeTriggers, onlyOn, type Triggers } from "./triggers";
import { backStep, columnOf, DEFAULT_BOARD, nextAfter, normalizeBoard, statusAfter, type Board, type BoardPreview } from "./board";
import { normalizeSetup, type BankDetails, type OrderingSettings, type OrderingSetup } from "./ordering";
import { live } from "./live";
import { endpointFor, useServerHealth, type Servers } from "./server-health";
import type { ServerName } from "./server-links";
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
  Addon,
  CreateOrderInput,
  Customer,
  DanClient,
  LoginInput,
  LoginResult,
  MenuItemPatch,
  Order,
  OrderStatus,
  SalesRange,
  SalesSummary,
  ServerPing,
  Session,
  ShopPatch,
  ShopSnapshot,
  Station,
} from "./types";
import { DEFAULT_STATIONS } from "./types";
import { normalizeStations } from "./stations";
import { normalizeAddons } from "./addons";
import { afterFetch, newLiveOrders, tellOrder } from "./live-orders";
import { normalizeViews, type View } from "./views";
import type { CloudSession } from "./cloud";

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
  /** Both servers' state, and which one the counter is using. */
  servers: Servers;
  notice: Notice | null;
  dismissNotice: () => void;
  rememberServer: (url: string) => void;
  forgetServer: (url: string) => void;
  loginRemote: (baseUrl: string, input: LoginInput, ping: ServerPing, cloudUrl?: string | null) => Promise<void>;
  /** Opens a sign-in the Dan cloud gave (email and password, an invite, a reset link). */
  adoptCloudSession: (cloud: CloudSession) => Promise<void>;
  /** The counter PIN at a shop that lives in the cloud, found by its address name. */
  loginCloudPin: (found: { staffUrl: string; addressName: string }, pin: string, ping: ServerPing) => Promise<void>;
  /** Owner only: adds, removes and arranges dishes and categories. */
  editMenu: <T>(work: (client: DanClient) => Promise<T>) => Promise<T>;
  /** Owner only: the shop's name, address and phone. */
  saveShop: (patch: ShopPatch) => Promise<void>;
  /** Owner only: the views of the order flow. A view that goes takes its sounds with it. */
  saveViews: (views: View[]) => Promise<View[]>;
  resetViews: () => Promise<View[]>;
  /** Owner only: the shop's stations, the whole list in order. */
  saveStations: (stations: Station[]) => Promise<Station[]>;
  /** Owner only: the shop's add-ons, the whole list in order. */
  saveAddons: (addons: Addon[]) => Promise<Addon[]>;
  enterDemo: () => void;
  logout: () => void;
  resetDemo: () => void;
  updateItem: (id: string, patch: MenuItemPatch) => Promise<void>;
  /** Owner only, through the Dan cloud. */
  addItemPhoto: (id: string, file: Blob) => Promise<void>;
  /** Owner only: how the shop takes orders and payment (and its bank details). */
  saveOrdering: (settings: OrderingSettings, bank?: BankDetails | null) => Promise<OrderingSetup>;
  /** Runs something on the server in use (printers, reprints). Not in the demo. */
  onServer: <T>(work: (client: GraphQLDanClient) => Promise<T>) => Promise<T>;
  removeItemPhoto: (id: string) => Promise<void>;
  placeOrder: (input: CreateOrderInput) => Promise<Order>;
  /** One order, wherever it is (the board has only the latest). */
  loadOrder: (id: string) => Promise<Order>;
  /** Owner only: changes an order's details or dishes. Recorded for good. */
  editOrder: (id: string, input: OrderEditInput) => Promise<Order>;
  /** Owner only: moves a ticket to any column, back included. Recorded for good. */
  moveOrderTo: (order: Order, column: string) => Promise<Order>;
  /** Owner only: the record of the owner's changes to one order, oldest first. */
  loadOrderEdits: (orderId: string) => Promise<OrderEdit[]>;
  /** Owner only: calls an order off for good. A card payment is refunded in full by the Dan cloud. */
  cancelOrder: (id: string) => Promise<Order>;
  /** The order list: a page of the shop's orders, newest first. */
  loadOrderHistory: (filter: OrderHistoryFilter, before?: string | null) => Promise<OrderPage>;
  setOrderStatus: (id: string, status: OrderStatus) => Promise<void>;
  /** Moves a ticket to the next column on the owner's board. */
  advanceOrder: (order: Order) => Promise<void>;
  /** Sends a ticket back one column, within the same stage. */
  sendBack: (order: Order) => Promise<void>;
  /** Owner only: the board's columns. `moveTickets`: the owner agreed to move tickets out of removed columns. */
  previewBoard: (board: Board) => Promise<BoardPreview>;
  saveBoard: (board: Board, moveTickets: boolean) => Promise<Board>;
  /** Owner only: the ticket sounds. */
  saveTriggers: (triggers: Triggers) => Promise<Triggers>;
  resetTriggers: () => Promise<Triggers>;
  resetBoard: () => Promise<Board>;
  /** Courier requests and changes to a delivery; cancelling an order. */
  courierAction: (action: CourierAction, id: string) => Promise<void>;
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
    ordering: normalizeSetup(state.ordering),
    board: normalizeBoard(state.board),
    stations: normalizeStations(state.stations, DEFAULT_STATIONS),
    addons: normalizeAddons(state.addons),
    views: normalizeViews(state.views, normalizeBoard(state.board)),
    // Sounds only where they can still play, as the server returns them.
    triggers: onlyOn(normalizeTriggers(state.triggers), normalizeViews(state.views, normalizeBoard(state.board)).map((view) => view.id)),
  };
}

async function pullRemote(baseUrl: string, token: string): Promise<Omit<ShopSnapshot, "shop"> & { theme: ThemeChoice }> {
  const client = new GraphQLDanClient(baseUrl, token);
  const [menu, orders, customers, theme, ordering, board, triggers, stations, addons] = await Promise.all([
    client.getMenu(),
    client.getOrders(),
    client.getCustomers(),
    client.getTheme(),
    client.getOrderingSettings(),
    client.getBoard(),
    client.getTriggers(),
    client.getStations(),
    client.getAddons(),
  ]);
  // After the board: a server from before views has the kitchen and the pass on it.
  const views = await client.getViews(board);
  return {
    categories: menu.categories,
    items: menu.items,
    orders: orders.orders,
    customers: customers.customers,
    ordering,
    board,
    triggers,
    stations,
    addons,
    views,
    theme,
  };
}

/** What the shop server's live channel sends. */
type ShopEvent = { kind: "order" | "menu" | "customers" | "theme" | "settings" | "resync"; order: Order | null };

/** Asked when the live channel opens, with the order fields this server knows. */
const shopEvents = () => `subscription ShopEvents { shopEvents { kind order { ${orderFields()} } } }`;

/** What the live channel has told of, so a full fetch does not put an older copy of an order back. */
const liveOrders = newLiveOrders();

/** The board in use, for telling which column a live order entered. */
let boardNow: Board = DEFAULT_BOARD;
/** Whether this page has noted the demo's board yet (its first look is not news). */
let demoNoted = false;

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

/**
 * The session for a shop that lives in the Dan cloud: its cloud address is
 * both the server and the cloud, with one sign-in.
 */
function cloudHome(staffUrl: string, addressName: string, signedIn: Pick<LoginResult, "token" | "staff" | "shop">): Session {
  return {
    mode: "remote",
    home: "cloud",
    addressName,
    serverUrl: staffUrl,
    token: signedIn.token,
    cloudUrl: staffUrl,
    cloudToken: signedIn.token,
    shop: signedIn.shop,
    staff: signedIn.staff,
  };
}

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const persisted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useReady();
  const [remote, setRemote] = useState<ShopSnapshot | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const session = ready ? persisted.session : null;
  const servers = useServerHealth(session);

  /*
   * A server refused this tablet's sign-in. The shop server's refusal signs
   * the tablet out. The cloud's only drops the cloud sign-in, which sends the
   * counter back to the shop server and stops it switching until the next login.
   */
  const signInRefused = useCallback((server: ServerName) => {
    const current = getSnapshot().session;
    if (server === "cloud" && current) {
      writePersisted({ session: { ...current, cloudToken: null } });
      return;
    }
    writePersisted({ session: null });
    setRemote(null);
  }, []);

  /** Saves a sign-in and loads the shop it is for. */
  const openSession = useCallback(async (next: Session, theme: ThemeChoice | undefined) => {
    if (!next.serverUrl || !next.token) throw new Error("Sign in first.");
    writePersisted({ session: next });
    adoptShopTheme(theme);
    const authed = new GraphQLDanClient(next.serverUrl, next.token);
    const [menu, orders, customers, ordering, board, triggers, stations, addons] = await Promise.all([
      authed.getMenu(),
      authed.getOrders(),
      authed.getCustomers(),
      authed.getOrderingSettings(),
      authed.getBoard(),
      authed.getTriggers(),
      authed.getStations(),
      authed.getAddons(),
    ]);
    const views = await authed.getViews(board);
    boardNow = board;
    noteBoard(orders.orders, board);
    setRemote({
      shop: next.shop,
      categories: menu.categories,
      items: menu.items,
      orders: orders.orders,
      customers: customers.customers,
      ordering,
      board,
      triggers,
      stations,
      addons,
      views,
    });
    setRemoteError(null);
  }, []);

  const refreshRemote = useCallback(async () => {
    const current = getSnapshot().session;
    const end = endpointFor(current);
    if (!current || !end) return;
    try {
      const startedAt = liveOrders.tick;
      const { theme, ...next } = await pullRemote(end.url, end.token);
      adoptShopTheme(theme);
      // A change the live channel brought while this was on its way is newer than what it fetched.
      next.orders = afterFetch(liveOrders, next.orders, startedAt);
      remoteOrders = next.orders;
      boardNow = next.board;
      // What a load brings is noted, never sounded: a refresh or reconnect replays nothing.
      noteBoard(next.orders, next.board);
      setRemote({ ...next, shop: current.shop });
      setRemoteError(null);
    } catch (error) {
      if (isDanError(error) && error.code === "unauthorized") {
        signInRefused(end.server);
        return;
      }
      setRemoteError(error instanceof Error ? error.message : "The shop server stopped answering.");
      throw error;
    }
  }, [signInRefused]);

  /*
   * The live channel of the server in use (the shop server, or the cloud while
   * it stands in; switching reconnects). Each (re)connection fetches everything
   * once, so nothing is missed while it was down. After that, an order change
   * arrives in full and is put on the board; a menu, stamp card or theme
   * notice fetches just that part. Nothing polls.
   */
  const liveMode = session?.mode;
  const liveOn = servers.inUse;
  const liveServer = liveOn === "cloud" ? session?.cloudUrl : session?.serverUrl;
  const liveToken = liveOn === "cloud" ? session?.cloudToken : session?.token;
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
      query: shopEvents(),
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
        if (code === "unauthorized") signInRefused(liveOn);
      },
      onData: ({ shopEvents: event }) => {
        if (event.kind === "order" && event.order) {
          const order = event.order;
          tellOrder(liveOrders, order);
          seeOrder(order, boardNow);
          setRemote((current) => {
            if (!current) return current;
            const others = current.orders.filter((entry) => entry.id !== order.id);
            return { ...current, orders: [order, ...others] };
          });
          if (order.source === "online" && order.status === "new" && !seen.has(order.id)) {
            setNotice({
              id: order.id,
              title: orderLabel(order.number, english("numberWaiting")),
              detail: `${fulfilmentLabel(order, english)} · ${formatPence(order.totalPence)}`,
              href: `/shop/ticket?order=${order.id}`,
            });
          }
          seen.add(order.id);
        } else if (event.kind === "menu") {
          void client.getMenu().then((menu) => setRemote((current) => (current ? { ...current, ...menu } : current))).catch(() => undefined);
          // Add-ons are told with the menu: every tablet follows the owner's change at once.
          void client
            .getAddons()
            .then((addons) => setRemote((current) => (current ? { ...current, addons } : current)))
            .catch(() => undefined);
        } else if (event.kind === "customers") {
          void client
            .getCustomers()
            .then(({ customers }) => setRemote((current) => (current ? { ...current, customers } : current)))
            .catch(() => undefined);
        } else if (event.kind === "theme") {
          void client.getTheme().then(adoptShopTheme).catch(() => undefined);
        } else if (event.kind === "settings") {
          void client
            .getOrderingSettings()
            .then((ordering) => setRemote((current) => (current ? { ...current, ordering } : current)))
            .catch(() => undefined);
          void client
            .getBoard()
            .then((board) => {
              boardNow = board;
              setRemote((current) => (current ? { ...current, board } : current));
            })
            .catch(() => undefined);
          void client
            .getTriggers()
            .then((triggers) => setRemote((current) => (current ? { ...current, triggers } : current)))
            .catch(() => undefined);
          // Stations and views are settings too: every tablet follows the owner's change at once.
          void client
            .getStations()
            .then((stations) => setRemote((current) => (current ? { ...current, stations } : current)))
            .catch(() => undefined);
          void client
            .getBoard()
            .then((board) => client.getViews(board))
            .then((views) => setRemote((current) => (current ? { ...current, views } : current)))
            .catch(() => undefined);
        } else {
          void refreshRemote().catch(() => undefined);
        }
      },
    });
    return stop;
  }, [ready, liveMode, liveOn, liveServer, liveToken, refreshRemote, signInRefused]);

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
              const where = fulfilmentLabel(order, english);
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

  /*
   * The demo has no live channel: its orders change in this browser (and in
   * other tabs, through storage). The first board this page sees is noted;
   * every change after that is told, like a live order event.
   */
  const demoOrders = session?.mode === "demo" ? snapshot?.orders : undefined;
  const demoBoard = session?.mode === "demo" ? snapshot?.board : undefined;
  useEffect(() => {
    if (!demoOrders || !demoBoard) {
      demoNoted = false;
      return;
    }
    boardNow = demoBoard;
    if (!demoNoted) {
      noteBoard(demoOrders, demoBoard);
      demoNoted = true;
      return;
    }
    for (const order of demoOrders) seeOrder(order, demoBoard);
  }, [demoOrders, demoBoard]);

  const value = useMemo<ShopContextValue>(() => {
    return {
      ready,
      persisted,
      snapshot,
      remoteError,
      servers,
      notice,
      dismissNotice: () => setNotice(null),
      rememberServer,
      forgetServer,
      async loginRemote(baseUrl, input, ping, cloudUrl = null) {
        const client = new GraphQLDanClient(baseUrl);
        const result = await client.login(input);
        // The same details sign in to the cloud as well (staff accounts sync). Not
        // being able to reach it is fine: the counter works on the shop server.
        const cloudToken = cloudUrl
          ? await new GraphQLDanClient(cloudUrl)
              .login(input)
              .then((signedIn) => signedIn.token)
              .catch(() => null)
          : null;
        writePersisted({ lastCloudUrl: cloudUrl, lastWay: "server" });
        await openSession({ mode: "remote", serverUrl: baseUrl, cloudUrl, cloudToken, token: result.token, shop: result.shop ?? ping.shop, staff: result.staff }, ping.theme);
      },
      async adoptCloudSession(cloud) {
        // The shop's theme comes with its ping; without it the page keeps its colours.
        const ping = await pingServer(cloud.staffUrl).catch(() => null);
        writePersisted({ lastShopName: cloud.addressName, lastWay: "cloud" });
        await openSession(cloudHome(cloud.staffUrl, cloud.addressName, cloud), ping?.theme);
      },
      async loginCloudPin(found, pin, ping) {
        const result = await new GraphQLDanClient(found.staffUrl).login({ pin });
        writePersisted({ lastShopName: found.addressName, lastWay: "cloud" });
        await openSession(cloudHome(found.staffUrl, found.addressName, { ...result, shop: result.shop ?? ping.shop }), ping.theme);
      },
      async editMenu(work) {
        if (getSnapshot().session?.mode === "demo") {
          return demoMutate((server) => work(server));
        }
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const result = await work(new GraphQLDanClient(end.url, end.token));
        await refreshRemote();
        return result;
      },
      async saveViews(views) {
        if (getSnapshot().session?.mode === "demo") return demoMutate((server) => server.updateViews(views));
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const saved = await new GraphQLDanClient(end.url, end.token).updateViews(views);
        // The sounds too: a view that went took its sounds with it.
        await refreshRemote();
        return saved;
      },
      async resetViews() {
        if (getSnapshot().session?.mode === "demo") return demoMutate((server) => server.resetViews());
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const saved = await new GraphQLDanClient(end.url, end.token).resetViews();
        await refreshRemote();
        return saved;
      },
      async saveStations(stations) {
        if (getSnapshot().session?.mode === "demo") return demoMutate((server) => server.updateStations(stations));
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const saved = await new GraphQLDanClient(end.url, end.token).updateStations(stations);
        setRemote((current) => (current ? { ...current, stations: saved } : current));
        return saved;
      },
      async saveAddons(addons) {
        if (getSnapshot().session?.mode === "demo") return demoMutate((server) => server.updateAddons(addons));
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const saved = await new GraphQLDanClient(end.url, end.token).updateAddons(addons);
        setRemote((current) => (current ? { ...current, addons: saved } : current));
        return saved;
      },
      async saveShop(patch) {
        const current = getSnapshot().session;
        if (current?.mode === "demo") {
          const saved = await demoMutate((server) => server.updateShop(patch));
          writePersisted({ session: { ...current, shop: saved } });
          return;
        }
        const end = endpointFor(current);
        if (!current || !end) throw new Error("Sign in first.");
        const saved = await new GraphQLDanClient(end.url, end.token).updateShop(patch);
        writePersisted({ session: { ...current, shop: saved } });
        setRemote((snapshot) => (snapshot ? { ...snapshot, shop: saved } : snapshot));
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
        if (current?.cloudUrl && current.cloudToken) {
          void new GraphQLDanClient(current.cloudUrl, current.cloudToken).logout().catch(() => undefined);
        }
        // Signing out also unlocks the tablet.
        writePersisted({ session: null, focus: null });
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
        const end = endpointFor(getSnapshot().session);
        if (!end) return;
        await new GraphQLDanClient(end.url, end.token).updateMenuItem(id, patch);
        await refreshRemote();
      },
      async saveOrdering(settings, bank) {
        if (getSnapshot().session?.mode === "demo") {
          return demoMutate((server) => server.updateOrderingSettings(settings, bank));
        }
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const saved = await new GraphQLDanClient(end.url, end.token).updateOrderingSettings(settings, bank);
        setRemote((current) => (current ? { ...current, ordering: saved } : current));
        return saved;
      },
      onServer(work) {
        const current = getSnapshot().session;
        if (current?.mode === "demo") {
          return Promise.reject(new DanError("printers_demo", english("printersDemo")));
        }
        const end = endpointFor(current);
        if (!end) return Promise.reject(new Error("Sign in first."));
        return work(new GraphQLDanClient(end.url, end.token));
      },
      async addItemPhoto(id, file) {
        const current = getSnapshot().session;
        if (current?.mode === "demo") {
          throw new DanError("photos_demo", english("menuPhotoDemo"));
        }
        if (!current?.cloudUrl || !current.cloudToken) {
          throw new DanError("photos_cloud_only", english("menuPhotoNeedsCloud"));
        }
        const photo = await uploadMenuPhoto(current.cloudUrl, current.cloudToken, id, await shrinkPhoto(file));
        // Shown at once; the shop server has it after its next sync.
        setRemote((snapshot) =>
          snapshot ? { ...snapshot, items: snapshot.items.map((item) => (item.id === id ? { ...item, photo } : item)) } : snapshot,
        );
      },
      async removeItemPhoto(id) {
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        await new GraphQLDanClient(end.url, end.token).removeMenuItemPhoto(id);
        await refreshRemote();
      },
      async placeOrder(input) {
        if (getSnapshot().session?.mode === "demo") {
          const order = await demoMutate((server) => server.createOrder(input));
          writePersisted({ activeOrderId: order.id });
          return order;
        }
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const order = await new GraphQLDanClient(end.url, end.token).createOrder(input);
        writePersisted({ activeOrderId: order.id });
        await refreshRemote();
        return order;
      },
      async loadOrder(id) {
        const current = getSnapshot().session;
        if (current?.mode === "demo") {
          const found = getSnapshot().demoState?.orders.find((entry) => entry.id === id);
          if (!found) throw new DanError("not_found", "That order is not here.");
          return found;
        }
        const end = endpointFor(current);
        if (!end) throw new Error("Sign in first.");
        return new GraphQLDanClient(end.url, end.token).getOrder(id);
      },
      async editOrder(id, input) {
        if (getSnapshot().session?.mode === "demo") return demoMutate((server) => server.editOrder(id, input));
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const edited = await new GraphQLDanClient(end.url, end.token).editOrder(id, input);
        await refreshRemote();
        return edited;
      },
      async moveOrderTo(order, column) {
        // This tablet's own move is not news to it.
        expectMine(order.id, column);
        if (getSnapshot().session?.mode === "demo") return demoMutate((server) => server.moveOrderTo(order.id, column));
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const moved = await new GraphQLDanClient(end.url, end.token).moveOrderTo(order.id, column);
        await refreshRemote();
        return moved;
      },
      async cancelOrder(id) {
        if (getSnapshot().session?.mode === "demo") return demoMutate((server) => server.cancelOrder(id));
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const cancelled = await new GraphQLDanClient(end.url, end.token).cancelOrder(id);
        await refreshRemote();
        return cancelled;
      },
      async loadOrderEdits(orderId) {
        const current = getSnapshot().session;
        if (current?.mode === "demo") return (getSnapshot().demoState?.orderEdits ?? []).filter((edit) => edit.orderId === orderId);
        const end = endpointFor(current);
        if (!end) throw new Error("Sign in first.");
        return new GraphQLDanClient(end.url, end.token).getOrderEdits(orderId);
      },
      async loadOrderHistory(filter, before) {
        const current = getSnapshot().session;
        if (current?.mode === "demo") {
          return historyPage(getSnapshot().demoState?.orders ?? [], filter, before);
        }
        const end = endpointFor(current);
        if (!end) throw new Error("Sign in first.");
        // A shop server from before the list: made from the orders the board has.
        return new GraphQLDanClient(end.url, end.token).getOrderHistory(filter, before, undefined, snapshot?.orders ?? []);
      },
      async setOrderStatus(id, status) {
        if (getSnapshot().session?.mode === "demo") {
          await demoMutate((server) => server.updateOrder(id, { status }));
          return;
        }
        const end = endpointFor(getSnapshot().session);
        if (!end) return;
        await new GraphQLDanClient(end.url, end.token).updateOrder(id, { status });
        await refreshRemote();
      },
      async advanceOrder(order) {
        const board = snapshot?.board ?? DEFAULT_BOARD;
        const here = columnOf(board, order);
        const next = here ? nextAfter(board, here.id) : null;
        if (!next) return;
        const status = statusAfter(order, next);
        // This tablet's own move is not news to it.
        expectMine(order.id, next.id);
        if (getSnapshot().session?.mode === "demo") {
          await demoMutate((server) => server.moveOrder(order.id, next.id));
          return;
        }
        const end = endpointFor(getSnapshot().session);
        if (!end) return;
        await new GraphQLDanClient(end.url, end.token).moveOrder(order.id, next.id, status);
        await refreshRemote();
      },
      async sendBack(order) {
        const board = snapshot?.board ?? DEFAULT_BOARD;
        const back = backStep(board, order);
        if (!back) return;
        expectMine(order.id, back.id);
        if (getSnapshot().session?.mode === "demo") {
          await demoMutate((server) => server.moveOrder(order.id, back.id));
          return;
        }
        const end = endpointFor(getSnapshot().session);
        if (!end) return;
        await new GraphQLDanClient(end.url, end.token).moveOrder(order.id, back.id, order.status);
        await refreshRemote();
      },
      async previewBoard(board) {
        if (getSnapshot().session?.mode === "demo") return demoMutate((server) => server.previewBoard(board));
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        return new GraphQLDanClient(end.url, end.token).previewBoard(board);
      },
      async saveBoard(board, moveTickets) {
        if (getSnapshot().session?.mode === "demo") return demoMutate((server) => server.updateBoard(board, moveTickets));
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const saved = await new GraphQLDanClient(end.url, end.token).updateBoard(board, moveTickets);
        await refreshRemote();
        return saved;
      },
      async saveTriggers(triggers) {
        if (getSnapshot().session?.mode === "demo") return demoMutate((server) => server.updateTriggers(triggers));
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const saved = await new GraphQLDanClient(end.url, end.token).updateTriggers(triggers);
        setRemote((current) => (current ? { ...current, triggers: saved } : current));
        return saved;
      },
      async resetTriggers() {
        if (getSnapshot().session?.mode === "demo") return demoMutate((server) => server.resetTriggers());
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const saved = await new GraphQLDanClient(end.url, end.token).resetTriggers();
        setRemote((current) => (current ? { ...current, triggers: saved } : current));
        return saved;
      },
      async resetBoard() {
        if (getSnapshot().session?.mode === "demo") return demoMutate((server) => server.resetBoard());
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const saved = await new GraphQLDanClient(end.url, end.token).resetBoard();
        await refreshRemote();
        return saved;
      },
      async courierAction(action, id) {
        if (getSnapshot().session?.mode === "demo") {
          await demoMutate((server) => server.courierAction(action, id));
          return;
        }
        const end = endpointFor(getSnapshot().session);
        if (!end) return;
        await new GraphQLDanClient(end.url, end.token).courierAction(action, id);
        await refreshRemote();
      },
      async createCustomer(input) {
        if (getSnapshot().session?.mode === "demo") {
          return demoMutate((server) => server.createCustomer(input));
        }
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const customer = await new GraphQLDanClient(end.url, end.token).createCustomer(input);
        await refreshRemote();
        return customer;
      },
      async addStamp(phone) {
        if (getSnapshot().session?.mode === "demo") {
          return demoMutate((server) => server.addStamp(phone));
        }
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const customer = await new GraphQLDanClient(end.url, end.token).addStamp(phone);
        await refreshRemote();
        return customer;
      },
      async redeemReward(phone) {
        if (getSnapshot().session?.mode === "demo") {
          return demoMutate((server) => server.redeemReward(phone));
        }
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        const customer = await new GraphQLDanClient(end.url, end.token).redeemReward(phone);
        await refreshRemote();
        return customer;
      },
      async loadSales(range) {
        if (getSnapshot().session?.mode === "demo") {
          const state = getSnapshot().demoState;
          if (!state) throw new DanError("no_demo", "Demo is not running.");
          return summarizeSales(state.orders, range, new Date());
        }
        const end = endpointFor(getSnapshot().session);
        if (!end) throw new Error("Sign in first.");
        return new GraphQLDanClient(end.url, end.token).getSales(range);
      },
      setActiveOrderId(id) {
        writePersisted({ activeOrderId: id });
      },
      retryRemote() {
        return refreshRemote();
      },
    };
  }, [notice, openSession, persisted, ready, refreshRemote, remoteError, servers, snapshot]);

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

/** A link that should open the demo straight away (the website's "Try the demo"). */
function wantsDemo(): boolean {
  if (typeof window === "undefined") return false;
  const value = new URLSearchParams(window.location.search).get("demo");
  return value === "1" || value === "true";
}

export function useSessionRedirect(destination: "home" | "shop") {
  const { ready, persisted, enterDemo } = useShop();
  const router = useRouter();
  const session = ready ? persisted.session : null;
  useEffect(() => {
    if (!ready) return;
    // /shop/orders?demo=1 with nobody signed in opens the demo there. Someone
    // already signed in to a real shop stays signed in.
    if (destination === "home" && !session && wantsDemo()) {
      enterDemo();
      return;
    }
    if (destination === "home" && !session) router.replace("/");
    if (destination === "shop" && session) router.replace("/shop/orders");
  }, [destination, ready, router, session, enterDemo]);
  return { ready, session };
}
