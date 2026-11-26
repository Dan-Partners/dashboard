/**
 * Dan shop-server contract.
 *
 * A Dan server (the box in the shop) implements these shapes.
 * The dashboard never invents a second protocol: both the browser demo
 * and {@link import("./graphql-client").GraphQLDanClient} speak this
 * interface. The shop server's wire contract is `schema.graphql` in
 * https://github.com/DanPartners/server.
 */

import type { ThemeChoice } from "./theme";

export const DAN_PRODUCT = "dan" as const;

export const ALLERGENS = [
  "celery",
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "lupin",
  "milk",
  "molluscs",
  "mustard",
  "nuts",
  "peanuts",
  "sesame",
  "soya",
  "sulphites",
] as const;

export type Allergen = (typeof ALLERGENS)[number];

export const STATIONS = ["wok", "fryer", "rice", "counter"] as const;
export type Station = (typeof STATIONS)[number];

export const ORDER_STATUSES = ["new", "preparing", "ready", "completed"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_SOURCES = ["counter", "phone", "online"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

/** `eat_in` orders come from a table's link on the customer site and are brought to that table. */
export const FULFILMENTS = ["collection", "delivery", "eat_in"] as const;
export type Fulfilment = (typeof FULFILMENTS)[number];

export type Shop = {
  id: string;
  name: string;
  nameZh: string;
  address: string;
  city: string;
  phone: string;
};

export type Staff = {
  id: string;
  name: string;
  role: "owner" | "counter";
};

export type ServerPing = {
  ok: true;
  product: typeof DAN_PRODUCT;
  version: string;
  shop: Shop;
  auth: {
    password: boolean;
    pin: boolean;
  };
  /** The shop's theme. Older servers may not send it. */
  theme?: ThemeChoice;
};

export type LoginInput =
  | { email: string; password: string; pin?: undefined }
  | { pin: string; email?: undefined; password?: undefined };

export type LoginResult = {
  token: string;
  staff: Staff;
  shop: Shop;
};

export type Category = {
  id: string;
  nameEn: string;
  nameZh: string;
  sort: number;
};

export type MenuInclude = {
  number: number;
  qty: number;
};

export type MenuItem = {
  id: string;
  number: number;
  categoryId: string;
  nameEn: string;
  nameZh: string;
  descriptionEn: string;
  pricePence: number;
  station: Station;
  allergens: Allergen[];
  soldOut: boolean;
  kind: "item" | "set";
  includes: MenuInclude[];
  /** The dish's photo, `images/<hash>`, served by the Dan cloud at the shop's address. */
  photo?: string | null;
};

export type MenuItemPatch = Partial<
  Pick<
    MenuItem,
    | "number"
    | "categoryId"
    | "nameEn"
    | "nameZh"
    | "descriptionEn"
    | "pricePence"
    | "station"
    | "allergens"
    | "soldOut"
  >
>;

export type MenuPayload = {
  categories: Category[];
  items: MenuItem[];
};

export type TicketComponent = {
  number: number;
  nameEn: string;
  nameZh: string;
  qty: number;
  station: Station;
};

export type OrderLine = {
  itemId: string;
  number: number;
  nameEn: string;
  nameZh: string;
  qty: number;
  unitPricePence: number;
  station: Station;
  kind: "item" | "set";
  components: TicketComponent[];
};

export type Order = {
  id: string;
  number: number;
  createdAt: string;
  source: OrderSource;
  fulfilment: Fulfilment;
  status: OrderStatus;
  customerName: string;
  phone: string;
  address: string;
  notes: string;
  /** The table an eat-in order is brought to, as the customer's link named it. */
  table?: string | null;
  lines: OrderLine[];
  totalPence: number;
  /** Orders from the customer site say how they are paid. Counter and phone orders have none. */
  payment?: OrderPayment | null;
};

export type OrderPayment = {
  method: "card" | "at_shop";
  status: "due" | "paid";
};

export type CreateOrderLine = {
  number: number;
  qty: number;
};

export type CreateOrderInput = {
  source: OrderSource;
  fulfilment: Fulfilment;
  customerName?: string;
  phone?: string;
  address?: string;
  notes?: string;
  table?: string | null;
  lines: CreateOrderLine[];
};

export type Customer = {
  id: string;
  phone: string;
  name: string;
  stamps: number;
  rewardsRedeemed: number;
  createdAt: string;
};

export type SalesRange = "today" | "week";

export type SalesTopItem = {
  number: number;
  nameEn: string;
  nameZh: string;
  qty: number;
  totalPence: number;
};

export type SalesSummary = {
  range: SalesRange;
  orderCount: number;
  totalPence: number;
  averagePence: number;
  collectionCount: number;
  deliveryCount: number;
  eatInCount: number;
  openCount: number;
  topItems: SalesTopItem[];
};

/**
 * What a shop server implements, and what the dashboard calls. Each method
 * is one GraphQL operation; see graphql-client.ts.
 */
/**
 * Whether the shop's data is safe off this machine: the shop server's nightly
 * encrypted backup to the Dan cloud. Owner only, and only from a real shop
 * server, so it is not part of DanClient (the demo has nothing to back up).
 */
export type BackupHealth = "off" | "waiting" | "ok" | "failed" | "stale";

export type BackupStatus = {
  health: BackupHealth;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastResult: string | null;
};

/** Whether the shop's changes are in step with the Dan cloud. Any signed-in staff. */
export type SyncStatus = {
  mode: "not_running" | "synced" | "waiting";
  pending: number;
  lastSyncedAt: string | null;
};

export interface DanClient {
  ping(): Promise<ServerPing>;
  login(input: LoginInput): Promise<LoginResult>;
  logout(): Promise<void>;
  getMenu(): Promise<MenuPayload>;
  updateMenuItem(id: string, patch: MenuItemPatch): Promise<MenuItem>;
  getOrders(): Promise<{ orders: Order[] }>;
  createOrder(input: CreateOrderInput): Promise<Order>;
  updateOrder(id: string, patch: { status: OrderStatus }): Promise<Order>;
  getCustomers(query?: { phone?: string }): Promise<{ customers: Customer[] }>;
  createCustomer(input: { phone: string; name: string }): Promise<Customer>;
  addStamp(phone: string): Promise<Customer>;
  redeemReward(phone: string): Promise<Customer>;
  getSales(range: SalesRange): Promise<SalesSummary>;
  /** The shop's theme, stored on the server. */
  getTheme(): Promise<ThemeChoice>;
  /** Owner only. */
  updateTheme(theme: ThemeChoice): Promise<ThemeChoice>;
}

export type SessionMode = "demo" | "remote";

export type Session = {
  mode: SessionMode;
  /** The shop server: the counter's first choice, always. */
  serverUrl: string | null;
  token: string | null;
  /** The Dan cloud, the counter's second server. Optional. */
  cloudUrl?: string | null;
  /** Signed in to the cloud too, with the same details. Missing when it could not be reached. */
  cloudToken?: string | null;
  shop: Shop;
  staff: Staff;
};

export type ShopSnapshot = {
  shop: Shop;
  categories: Category[];
  items: MenuItem[];
  orders: Order[];
  customers: Customer[];
};
