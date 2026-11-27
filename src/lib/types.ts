import type { View } from "./views";
import type { OrderHistoryFilter, OrderPage } from "./history";
import type { OrderEdit, OrderEditInput } from "./order-edit";
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
  /**
   * A shop server whose shop lives in the Dan cloud (DAN-34): the cloud's
   * one address (DAN-43), where the shop's settings are saved. Null until the
   * machine has reached the cloud once; missing from older servers.
   */
  cloudUrl?: string | null;
  /** With cloudUrl: the shop's address name there, for a tablet's PIN sign-in (DAN-43). */
  cloudAddressName?: string | null;
};

/** The owner's email and password, or a staff member's name and PIN (DAN-44). */
export type LoginInput =
  | { email: string; password: string; pin?: undefined; name?: undefined }
  | { name: string; pin: string; email?: undefined; password?: undefined };

/** A staff member as the owner sees them (DAN-44). Never the PIN. */
export type StaffMember = { id: string; name: string; createdAt: string };

/** One line of the shop's activity log: who did what, when. Owner only. */
export type ActivityEntry = {
  id: string;
  at: string;
  byId: string;
  byName: string;
  /** owner, staff or online. */
  byRole: string;
  action: string;
  orderId: string | null;
  orderNumber: number | null;
  detail: string;
};

export type ActivityPage = { entries: ActivityEntry[]; more: boolean };

/** By one person (their id), between two times (ISO), older than `before` for the next page. */
export type ActivityQuery = { by?: string | null; from?: string | null; to?: string | null; before?: string | null; limit?: number };

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

/** How many choices are made in a group of a dish's options: exactly one (a size), or any number (extras). */
export type OptionKind = "one" | "any";

/** One choice in a group of a dish's options. */
export type OptionChoice = {
  /** Its own within the dish: a-z, 0-9, - and _. Orders name choices by it. */
  id: string;
  nameEn: string;
  nameZh: string;
  /** What it adds to the dish's price, in pence. A minus takes off; 0 changes nothing. */
  pricePence: number;
  /** Allergens this choice brings that the dish itself may not have. */
  allergens: Allergen[];
};

/** A group of a dish's options: "Size", "Extras". */
export type OptionGroup = {
  id: string;
  nameEn: string;
  nameZh: string;
  kind: OptionKind;
  choices: OptionChoice[];
};

/** An option chosen for a dish on an order, as it was when the order was taken. */
export type ChosenOption = {
  groupId: string;
  choiceId: string;
  groupEn: string;
  groupZh: string;
  nameEn: string;
  nameZh: string;
  pricePence: number;
};

export type AmountKind = "fixed" | "percent";

/**
 * One of the shop's add-ons: a named amount for the whole bill or for one
 * dish, plus or minus (a service charge, a carrier bag, a promotion).
 */
export type Addon = {
  /** Stable: a-z, 0-9, - and _. Orders name add-ons by it. */
  id: string;
  nameEn: string;
  nameZh: string;
  /** `bill`: one line on the bill. `dish`: attached to a dish, and offered on every dish. */
  scope: "bill" | "dish";
  kind: AmountKind;
  /** Pence for a fixed amount; hundredths of a percent for a percentage (1000 is 10%). A minus takes off. Never 0. */
  value: number;
  /** Ticked by default. */
  auto: boolean;
  /** Always applied: whoever creates the order cannot take it off. */
  required: boolean;
  /** Orders customers place online, orders staff create, or both. */
  channels: "online" | "local" | "both";
};

/** An add-on as it was applied to an order or to one of its lines. */
export type AppliedAddon = {
  id: string;
  nameEn: string;
  nameZh: string;
  kind: AmountKind;
  /** The add-on's own amount when it was applied. */
  value: number;
  /** What it came to on this bill or line, in pence. A minus takes off. */
  amountPence: number;
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
  /** The dish's options, in the order they are asked. Missing or empty for most dishes. */
  options?: OptionGroup[];
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
  options?: OptionGroup[];
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
    | "options"
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
  /** The options chosen for this dish. Their prices are already in `unitPricePence`. */
  options?: ChosenOption[];
  /** Add-ons on this dish, with what each came to for the whole line. */
  addons?: AppliedAddon[];
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
  /** Add-ons on the whole bill, with what each came to. Already in `totalPence`. */
  addons?: AppliedAddon[];
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
  /** How many times the owner has changed its details or dishes. Each change is recorded for good. */
  editCount?: number | null;
  /** What was taken when it was paid, once a change has made the bill differ from it. */
  paidPence?: number | null;
  /** Owner only (DAN-44): who took it at the counter or by phone. Null for staff, and for an online order. */
  takenBy?: { id: string; name: string } | null;
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
  /** The ids of the option choices taken. A "choose one" group with none named takes its first choice. */
  options?: string[];
  /** The ids of the dish add-ons ticked. Left out: the ones ticked by default. Required ones apply either way. */
  addons?: string[];
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
  /** The ids of the bill add-ons ticked. Left out: the ones ticked by default. Required ones apply either way. */
  addons?: string[];
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
  /** `key_refused`: the cloud no longer accepts the shop's key (DAN-34). */
  mode: "not_running" | "synced" | "waiting" | "key_refused";
  pending: number;
  lastSyncedAt: string | null;
  /**
   * The machine's last round with the cloud worked, in the last 30 seconds:
   * the shop's settings can be saved now. Missing from older shop servers,
   * whose settings are their own.
   */
  connected?: boolean;
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
  /** Owner only (DAN-44): the shop's staff, in the order they were added. */
  getStaff(): Promise<StaffMember[]>;
  /** Owner only: a staff member with their own PIN (4 to 6 digits). The first ends the old shared PIN. */
  addStaff(name: string, pin: string): Promise<StaffMember>;
  /** Owner only. Their sign-ins carry on. */
  renameStaff(id: string, name: string): Promise<StaffMember>;
  /** Owner only. Their sign-ins end. */
  setStaffPin(id: string, pin: string): Promise<StaffMember>;
  /** Owner only. Their sign-ins end. */
  removeStaff(id: string): Promise<void>;
  /** Owner only: everything people did in the shop, newest first. */
  getActivity(query?: ActivityQuery): Promise<ActivityPage>;
  /** The owner's views. */
  getViews(): Promise<View[]>;
  /** Owner only: the whole list. A view that goes takes its sounds with it. */
  updateViews(views: View[]): Promise<View[]>;
  /** Owner only: back to the views the shop started with. */
  resetViews(): Promise<View[]>;
  /** The shop's stations, in order. */
  getStations(): Promise<Station[]>;
  /** Owner only: the whole list. Refused (`station_in_use`) while a station that would go is still on dishes. */
  updateStations(stations: Station[]): Promise<Station[]>;
  /** The shop's add-ons, in the owner's order. */
  getAddons(): Promise<Addon[]>;
  /** Owner only: the whole list. Orders already taken keep the add-ons they were placed with. */
  updateAddons(addons: Addon[]): Promise<Addon[]>;
  getOrders(): Promise<{ orders: Order[] }>;
  /** The order list: newest first, a page at a time, back through every order. */
  getOrderHistory(filter?: OrderHistoryFilter, before?: string | null, limit?: number): Promise<OrderPage>;
  createOrder(input: CreateOrderInput): Promise<Order>;
  /** One order, wherever it is: on the board, finished long ago, or cancelled. */
  getOrder(id: string): Promise<Order>;
  /** Owner only: changes an order's details or dishes. Recorded for good. */
  editOrder(id: string, input: OrderEditInput): Promise<Order>;
  /** Owner only: moves a ticket to any column, back included. Recorded for good. */
  moveOrderTo(id: string, column: string): Promise<Order>;
  /** Owner only: the record of the owner's changes to one order, oldest first. */
  getOrderEdits(orderId: string): Promise<OrderEdit[]>;
  /** Owner only: calls an order off for good, a completed one included. A card payment is refunded in full. */
  cancelOrder(id: string): Promise<Order>;
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
  /** The Dan cloud's one address (https://cloud.dan.partners), the counter's second server. Optional. */
  cloudUrl?: string | null;
  /** Signed in to the cloud too, with the same details. Missing when it could not be reached. */
  cloudToken?: string | null;
  /**
   * "cloud": the shop lives in the Dan cloud and has no shop server. Then
   * `serverUrl` and `cloudUrl` are both the cloud's one address.
   */
  home?: "cloud";
  /** The shop's address name in the cloud (goldendragon), when known. */
  addressName?: string | null;
  /**
   * The shop's own address (https://goldendragon.dan.partners): its ordering
   * site, dish photos and Uber's notices. From the cloud's sign-in (DAN-43).
   */
  shopAddress?: string | null;
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
  /** The owner's views of the order flow (a kitchen, a pass). May be empty. */
  views: View[];
  /** The shop's add-ons, in the owner's order. May be empty. */
  addons: Addon[];
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
