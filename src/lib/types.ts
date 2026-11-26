import type { Triggers } from "./triggers";
import type { Board } from "./board";
import type { OrderingSetup } from "./ordering";
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

/**
 * A station: where dishes are made or packed. The owner names them, and a
 * shop can have none. Dishes, order lines and printers hold a station's `id`.
 */
export type Station = { id: string; nameEn: string; nameZh: string };

/** What a shop with nothing saved has: the four a takeaway kitchen starts with. */
export const DEFAULT_STATIONS: Station[] = [
  { id: "wok", nameEn: "Wok", nameZh: "鑊" },
  { id: "fryer", nameEn: "Fryer", nameZh: "炸爐" },
  { id: "rice", nameEn: "Rice", nameZh: "飯" },
  { id: "counter", nameEn: "Counter", nameZh: "櫃檯" },
];

export const ORDER_STATUSES = ["new", "preparing", "ready", "completed"] as const;
/** The board's four steps, and `cancelled`: called off by staff, final, off the board. */
export type OrderStatus = (typeof ORDER_STATUSES)[number] | "cancelled";

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
  /** The id of the station it is made at; "" for none. */
  station: string;
  allergens: Allergen[];
  soldOut: boolean;
  kind: "item" | "set";
  includes: MenuInclude[];
  /** The dish's photo, `images/<hash>`, served by the Dan cloud at the shop's address. */
  photo?: string | null;
};

/** A new dish. A name given in one language only is used for both. */
export type NewMenuItem = {
  number: number;
  categoryId: string;
  nameEn: string;
  nameZh: string;
  descriptionEn?: string;
  pricePence: number;
  station?: string;
  allergens?: Allergen[];
};

/** A category's names. A name given in one language only is used for both. */
export type CategoryNames = { nameEn: string; nameZh: string };

/** The shop's details, as tickets and the customer site show them. */
export type ShopPatch = Partial<Pick<Shop, "name" | "nameZh" | "address" | "city" | "phone">>;

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
  station: string;
};

export type OrderLine = {
  itemId: string;
  number: number;
  nameEn: string;
  nameZh: string;
  qty: number;
  unitPricePence: number;
  station: string;
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
  /** A delivery's fee, already in the total. */
  deliveryFeePence?: number | null;
  /** Who carries a delivery: the shop's own driver, or Uber Direct. Empty: staff choose. */
  deliveryBy?: "shop" | "uber_direct" | null;
  /** The Uber courier, as the Dan cloud last heard. */
  courier?: Courier | null;
  /** For a cancelled card order: "refunded", or "failed" (refund it in Stripe). */
  refund?: string | null;
  /** The board column it sits in. Empty: the first column for its status. */
  column?: string | null;
  /** When it entered that column. */
  columnAt?: string | null;
  /** True when a change to the board moved it there, not staff (no sound). */
  columnRemap?: boolean | null;
};

export type Courier = {
  /** Uber's delivery id; empty until booked. */
  deliveryId: string;
  /** pending, pickup, pickup_complete, dropoff, delivered, canceled, returned; "failed" when booking failed. */
  status: string;
  trackingUrl: string;
  feePence: number;
  pickupEta: string;
  dropoffEta: string;
  courierName: string;
  /** Set when staff must decide what next. */
  problem: string;
};

export type OrderPayment = {
  method: "card" | "at_shop" | "bank_transfer";
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
  /** Owner only: building the menu. */
  createMenuItem(input: NewMenuItem): Promise<MenuItem>;
  /** Refused (`in_a_set`) while a set meal includes the dish. */
  deleteMenuItem(id: string): Promise<void>;
  createCategory(names: CategoryNames): Promise<Category>;
  updateCategory(id: string, names: CategoryNames): Promise<Category>;
  /** Refused (`category_not_empty`) while it holds dishes. */
  deleteCategory(id: string): Promise<void>;
  /** Every category id, in the new order. */
  reorderCategories(ids: string[]): Promise<Category[]>;
  /** Owner only: the shop's name, address and phone. */
  updateShop(patch: ShopPatch): Promise<Shop>;
  /** Owner only: sets or changes the counter PIN (4 to 6 digits). */
  setCounterPin(pin: string): Promise<void>;
  /** The shop's stations, in order. */
  getStations(): Promise<Station[]>;
  /** Owner only: the whole list. Refused (`station_in_use`) while a station that would go is still on dishes. */
  updateStations(stations: Station[]): Promise<Station[]>;
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
  /**
   * "cloud": the shop lives in the Dan cloud and has no shop server. Then
   * `serverUrl` and `cloudUrl` are both the shop's cloud address.
   */
  home?: "cloud";
  /** The shop's address name in the cloud (goldendragon), when known. */
  addressName?: string | null;
  shop: Shop;
  staff: Staff;
};

export type ShopSnapshot = {
  shop: Shop;
  /** The owner's board columns. */
  board: Board;
  /** The ticket sounds. */
  triggers: Triggers;
  /** How the shop takes orders and payment. */
  ordering: OrderingSetup;
  /** The shop's stations, in the kitchen's order. May be empty. */
  stations: Station[];
  categories: Category[];
  items: MenuItem[];
  orders: Order[];
  customers: Customer[];
};

export type Paper = "MM58" | "MM80";

/** A receipt printer on the shop's network; the shop server prints to it. */
export type Printer = {
  id: string;
  name: string;
  host: string;
  port: number;
  paper: Paper;
  /** Station ids. Empty: the whole order, with its total. */
  stations: string[];
  copies: number;
  enabled: boolean;
};

export type PrinterInput = Omit<Printer, "id" | "port"> & { id?: string; port?: number };

/** How a printer is doing, for the strip on every tablet. */
export type PrinterStatus = {
  printerId: string;
  name: string;
  waiting: number;
  failed: number;
  failing: boolean;
  lastError: string | null;
};

/** A bank transfer waiting for staff to see it arrive (held in the Dan cloud). */
export type AwaitingPayment = {
  id: string;
  reference: string;
  customerName: string;
  phone: string;
  fulfilment: Fulfilment;
  table: string | null;
  address: string;
  lines: { number: number; nameEn: string; nameZh: string; qty: number; unitPricePence: number }[];
  totalPence: number;
  createdAt: string;
  expiresAt: string;
};
