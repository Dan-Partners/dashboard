/**
 * Dan shop-server contract.
 *
 * A Dan server (the box in the shop) implements these shapes.
 * The dashboard never invents a second protocol: both the browser demo
 * and {@link import("./http-client").HttpDanClient} speak this interface.
 */

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

export const FULFILMENTS = ["collection", "delivery"] as const;
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
  lines: OrderLine[];
  totalPence: number;
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
  openCount: number;
  topItems: SalesTopItem[];
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

/**
 * What a shop server implements, and what the dashboard calls.
 * Paths are listed in README under "Server API".
 */
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
}

export type SessionMode = "demo" | "remote";

export type Session = {
  mode: SessionMode;
  serverUrl: string | null;
  token: string | null;
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
