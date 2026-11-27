import { asDanError, DanError } from "./errors";
import { normalizeServerUrl } from "./url";
import type {
  Addon,
  AwaitingPayment,
  Category,
  CategoryNames,
  CreateOrderInput,
  Customer,
  DanClient,
  LoginInput,
  LoginResult,
  MenuItem,
  MenuItemPatch,
  MenuPayload,
  NewMenuItem,
  Order,
  OrderStatus,
  Printer,
  PrinterInput,
  PrinterStatus,
  SalesRange,
  SalesSummary,
  SyncStatus,
  ServerPing,
  Shop,
  ShopPatch,
  Station,
} from "./types";
import { DAN_PRODUCT, DEFAULT_STATIONS } from "./types";
import { normalizeTheme, type ThemeChoice } from "./theme";
import { DEFAULT_SETUP, type BankDetails, type OrderingSettings, type OrderingSetup } from "./ordering";
import { DEFAULT_BOARD, type Board, type BoardPreview } from "./board";
import { DEFAULT_TRIGGERS, TRIGGER_FIELDS, type Triggers } from "./triggers";
import { kitchenAndPass, VIEW_FIELDS, type View } from "./views";
import { HISTORY_PAGE, historyPage, type OrderHistoryFilter, type OrderPage } from "./history";
import { orderEditFields, type OrderEdit, type OrderEditInput } from "./order-edit";
import { DEFAULT_UBER, UBER_FIELDS, type UberKeys, type UberOptions, type UberOptionsInput } from "./uber";

/**
 * Talks to a Dan shop server over GraphQL. The wire contract is
 * `schema.graphql` in https://github.com/DanPartners/server; this file asks
 * for exactly the fields the types in ./types.ts declare.
 */

const PING_TIMEOUT_MS = 6000;

const SHOP = "id name nameZh address city phone";
const THEME = "preset typeface custom { paper ink accent chrome }";
const STAFF = "id name role";
const CATEGORY = "id nameEn nameZh sort";
const STATION = "id nameEn nameZh";
const MENU_ITEM_BASE =
  "id number categoryId nameEn nameZh descriptionEn pricePence station allergens soldOut kind includes { number qty }";
const MENU_ITEM_PHOTO = `${MENU_ITEM_BASE} photo`;
/** With a dish's options (DAN-32). */
const MENU_ITEM = `${MENU_ITEM_PHOTO} options { id nameEn nameZh kind choices { id nameEn nameZh pricePence allergens } }`;
/** What a shop server may know of a dish, newest first: asked in turn until one is read. */
const MENU_ITEM_LEVELS = [MENU_ITEM, MENU_ITEM_PHOTO, MENU_ITEM_BASE];
const ADDON = "id nameEn nameZh scope kind value auto required channels";
const APPLIED_ADDON = "id nameEn nameZh kind value amountPence";
const PRINTER = "id name host port paper stations copies enabled";
const ORDERING =
  "settings { till table collection delivery uberDirect payInPerson stripe bankTransfer deliveryFeePence deliveryMinimumPence } bank { accountName sortCode accountNumber referencePrefix } uberReady";
/** The order fields a shop server from before delivery and bank transfer knows. */
const ORDER_HEAD = "id number createdAt source fulfilment status customerName phone address notes table totalPence payment { method status }";
const LINE_FIELDS = "itemId number nameEn nameZh qty unitPricePence station kind components { number nameEn nameZh qty station }";
const ORDER_FIELDS_BASE = `${ORDER_HEAD}
  lines { ${LINE_FIELDS} }`;
/** With the options chosen for each dish, and the add-ons on dishes and on the bill (DAN-32). */
const ORDER_FIELDS_PRICED = `${ORDER_HEAD}
  lines { ${LINE_FIELDS} options { groupId choiceId groupEn groupZh nameEn nameZh pricePence } addons { ${APPLIED_ADDON} } } addons { ${APPLIED_ADDON} }`;
const BOARD_COLUMN = "id nameEn nameZh role colour";
const COURIER = "courier { deliveryId status trackingUrl feePence pickupEta dropoffEta courierName problem } refund";
/** What the shop server knows: 5 with options and add-ons (DAN-32), 4 with the owner's changes (DAN-31), 3 with board columns (DAN-25), 2 with couriers (DAN-23), 1 with delivery fees, 0 before them. */
let orderLevel = 5;
/** The order fields the dashboard uses, for queries and the live channel alike. */
export function orderFields(): string {
  if (orderLevel >= 5) return `${ORDER_FIELDS_PRICED} deliveryFeePence deliveryBy ${COURIER} column columnAt columnRemap editCount paidPence`;
  if (orderLevel === 4) return `${ORDER_FIELDS_BASE} deliveryFeePence deliveryBy ${COURIER} column columnAt columnRemap editCount paidPence`;
  if (orderLevel === 3) return `${ORDER_FIELDS_BASE} deliveryFeePence deliveryBy ${COURIER} column columnAt columnRemap`;
  if (orderLevel === 2) return `${ORDER_FIELDS_BASE} deliveryFeePence deliveryBy ${COURIER}`;
  return orderLevel === 1 ? `${ORDER_FIELDS_BASE} deliveryFeePence deliveryBy` : ORDER_FIELDS_BASE;
}
const CUSTOMER = "id phone name stamps rewardsRedeemed createdAt";
const SALES =
  "range orderCount totalPence averagePence collectionCount deliveryCount eatInCount openCount topItems { number nameEn nameZh qty totalPence }";

type GraphQLError = { message?: string; extensions?: { code?: unknown } };
type GraphQLBody<T> = { data?: T | null; errors?: GraphQLError[] };

export function endpoint(baseUrl: string): string {
  return `${normalizeServerUrl(baseUrl)}/graphql`;
}

function errorFrom(error: GraphQLError | undefined, status: number): DanError {
  const code = typeof error?.extensions?.code === "string" ? error.extensions.code : undefined;
  if (code) return new DanError(code, error?.message || "The server could not do that.");
  if (status === 401) return new DanError("unauthorized", "Those details were not recognised.");
  return new DanError("bad_response", "The server answered in a way Dan could not read.");
}

/** Sends one GraphQL operation and returns its data, or throws a DanError with the server's code. */
export async function graphql<T>(
  baseUrl: string,
  query: string,
  variables: Record<string, unknown> = {},
  options: { token?: string | null; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(endpoint(baseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    throw asDanError(error);
  }
  let body: GraphQLBody<T> | null = null;
  try {
    const text = await response.text();
    body = text ? (JSON.parse(text) as GraphQLBody<T>) : null;
  } catch {
    body = null;
  }
  if (body?.errors?.length) throw errorFrom(body.errors[0], response.status);
  if (!response.ok || !body || body.data == null) throw errorFrom(undefined, response.status);
  return body.data;
}

export async function pingServer(input: string, fetchImpl: typeof fetch = fetch): Promise<ServerPing> {
  const base = normalizeServerUrl(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const data = await graphql<{ ping: ServerPing }>(
      base,
      `query Ping { ping { ok product version shop { ${SHOP} } auth { password pin } theme { ${THEME} } } }`,
      {},
      { fetchImpl, signal: controller.signal },
    );
    const ping = data.ping;
    if (ping?.theme) ping.theme = normalizeTheme(ping.theme);
    if (!ping || ping.ok !== true || ping.product !== DAN_PRODUCT || !ping.shop?.name) {
      throw new DanError("not_dan", "That address answered, but it is not a Dan server.");
    }
    return ping;
  } catch (error) {
    if (error instanceof DanError) {
      // A Dan server that is not set up yet says so. Anything else that answered is not Dan.
      if (["unreachable", "timeout", "not_set_up", "not_dan"].includes(error.code)) throw error;
      throw new DanError("not_dan", "That address answered, but it is not a Dan server.");
    }
    throw asDanError(error);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Is the shop there on the Dan cloud? A shop's cloud address is its staff API
 * there (`https://<shop>.dan.partners/staff`), so this pings it like a shop
 * server: it answers only if the cloud is up and runs that shop.
 */
export async function checkCloud(base: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  return pingServer(base, fetchImpl).then(
    () => true,
    () => false,
  );
}

export class GraphQLDanClient implements DanClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string | null,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private run<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    return graphql<T>(this.baseUrl, query, variables, { token: this.token, fetchImpl: this.fetchImpl });
  }

  ping() {
    return pingServer(this.baseUrl, this.fetchImpl);
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const variables = input.pin ? { input: { pin: input.pin } } : { input: { email: input.email, password: input.password } };
    const data = await this.run<{ login: LoginResult }>(
      `mutation Login($input: LoginInput!) { login(input: $input) { token staff { ${STAFF} } shop { ${SHOP} } } }`,
      variables,
    );
    return data.login;
  }

  async logout(): Promise<void> {
    await this.run<{ logout: boolean }>("mutation Logout { logout }");
  }

  /**
   * Runs a query that asks for dish photos. A shop server from before them
   * does not know the field and says so without a code (a query it cannot
   * read), so the query is asked once more without it.
   */
  private async withPhotos<T>(query: (fields: string) => string, variables: Record<string, unknown> = {}): Promise<T> {
    for (const fields of MENU_ITEM_LEVELS.slice(0, -1)) {
      try {
        return await this.run<T>(query(fields), variables);
      } catch (error) {
        if (!(error instanceof DanError && error.code === "bad_response")) throw error;
      }
    }
    return this.run<T>(query(MENU_ITEM_BASE), variables);
  }

  async getMenu(): Promise<MenuPayload> {
    const data = await this.withPhotos<{ menu: MenuPayload }>(
      (fields) => `query Menu { menu { categories { id nameEn nameZh sort } items { ${fields} } } }`,
    );
    return data.menu;
  }

  // ------------------------------------------------------------ printers (the shop server's)

  async getPrinters(): Promise<Printer[]> {
    const data = await this.run<{ printers: Printer[] }>(`query Printers { printers { ${PRINTER} } }`);
    return data.printers;
  }

  /** How each printer is doing. A shop server from before printing has none. */
  async getPrintStatus(): Promise<PrinterStatus[]> {
    const data = await this.run<{ printStatus: PrinterStatus[] }>(
      "query PrintStatus { printStatus { printerId name waiting failed failing lastError } }",
    );
    return data.printStatus;
  }

  /** Owner only. */
  async savePrinter(input: PrinterInput): Promise<Printer> {
    const data = await this.run<{ savePrinter: Printer }>(
      `mutation SavePrinter($input: PrinterInput!) { savePrinter(input: $input) { ${PRINTER} } }`,
      { input },
    );
    return data.savePrinter;
  }

  /** Owner only. */
  async removePrinter(id: string): Promise<void> {
    await this.run("mutation RemovePrinter($id: ID!) { removePrinter(id: $id) }", { id });
  }

  async testPrint(printerId: string): Promise<void> {
    await this.run("mutation TestPrint($id: ID!) { testPrint(printerId: $id) }", { id: printerId });
  }

  /** Prints an order again on every printer that takes it. Says how many. */
  async reprintOrder(orderId: string): Promise<number> {
    const data = await this.run<{ reprintOrder: number }>("mutation Reprint($id: ID!) { reprintOrder(orderId: $id) }", { id: orderId });
    return data.reprintOrder;
  }

  async retryPrinting(): Promise<void> {
    await this.run("mutation { retryPrinting }");
  }

  async dismissPrintFailures(): Promise<void> {
    await this.run("mutation { dismissPrintFailures }");
  }

  /** Owner only. Takes a dish's photo off (any server). */
  async removeMenuItemPhoto(id: string): Promise<MenuItem> {
    const data = await this.run<{ removeMenuItemPhoto: MenuItem }>(
      `mutation RemoveMenuItemPhoto($id: ID!) { removeMenuItemPhoto(id: $id) { ${MENU_ITEM} } }`,
      { id },
    );
    return data.removeMenuItemPhoto;
  }

  // ------------------------------------------------------------ building the menu (owner only)

  async createMenuItem(input: NewMenuItem): Promise<MenuItem> {
    const data = await this.run<{ createMenuItem: MenuItem }>(
      `mutation CreateMenuItem($input: NewMenuItem!) { createMenuItem(input: $input) { ${MENU_ITEM} } }`,
      { input },
    );
    return data.createMenuItem;
  }

  async deleteMenuItem(id: string): Promise<void> {
    await this.run<{ deleteMenuItem: boolean }>(`mutation DeleteMenuItem($id: ID!) { deleteMenuItem(id: $id) }`, { id });
  }

  async createCategory(names: CategoryNames): Promise<Category> {
    const data = await this.run<{ createCategory: Category }>(
      `mutation CreateCategory($input: CategoryInput!) { createCategory(input: $input) { ${CATEGORY} } }`,
      { input: names },
    );
    return data.createCategory;
  }

  async updateCategory(id: string, names: CategoryNames): Promise<Category> {
    const data = await this.run<{ updateCategory: Category }>(
      `mutation UpdateCategory($id: ID!, $input: CategoryInput!) { updateCategory(id: $id, input: $input) { ${CATEGORY} } }`,
      { id, input: names },
    );
    return data.updateCategory;
  }

  async deleteCategory(id: string): Promise<void> {
    await this.run<{ deleteCategory: boolean }>(`mutation DeleteCategory($id: ID!) { deleteCategory(id: $id) }`, { id });
  }

  async reorderCategories(ids: string[]): Promise<Category[]> {
    const data = await this.run<{ reorderCategories: Category[] }>(
      `mutation ReorderCategories($ids: [ID!]!) { reorderCategories(ids: $ids) { ${CATEGORY} } }`,
      { ids },
    );
    return data.reorderCategories;
  }

  async updateShop(patch: ShopPatch): Promise<Shop> {
    const data = await this.run<{ updateShop: Shop }>(
      `mutation UpdateShop($patch: ShopPatch!) { updateShop(patch: $patch) { ${SHOP} } }`,
      { patch },
    );
    return data.updateShop;
  }

  /** The owner's views. A server from before views has the kitchen and the pass. */
  async getViews(board: Board = DEFAULT_BOARD): Promise<View[]> {
    try {
      const data = await this.run<{ views: View[] }>(`query Views { views { ${VIEW_FIELDS} } }`);
      return data.views;
    } catch (error) {
      if (error instanceof DanError && error.code === "bad_response") return kitchenAndPass(board);
      throw error;
    }
  }

  /** Owner only. */
  async updateViews(views: View[]): Promise<View[]> {
    const data = await this.run<{ updateViews: View[] }>(
      `mutation UpdateViews($views: [ViewInput!]!) { updateViews(views: $views) { ${VIEW_FIELDS} } }`,
      { views: views.map(({ id, nameEn, nameZh, look, columns }) => ({ id, nameEn, nameZh, look, columns })) },
    );
    return data.updateViews;
  }

  /** Owner only. */
  async resetViews(): Promise<View[]> {
    const data = await this.run<{ resetViews: View[] }>(`mutation ResetViews { resetViews { ${VIEW_FIELDS} } }`);
    return data.resetViews;
  }

  /** The shop's stations. A server from before stations could be named has the four fixed ones. */
  async getStations(): Promise<Station[]> {
    try {
      const data = await this.run<{ stations: Station[] }>(`query Stations { stations { ${STATION} } }`);
      return data.stations;
    } catch (error) {
      if (error instanceof DanError && error.code === "bad_response") return DEFAULT_STATIONS;
      throw error;
    }
  }

  /** Owner only. */
  async updateStations(stations: Station[]): Promise<Station[]> {
    const data = await this.run<{ updateStations: Station[] }>(
      `mutation UpdateStations($stations: [StationInput!]!) { updateStations(stations: $stations) { ${STATION} } }`,
      { stations: stations.map(({ id, nameEn, nameZh }) => ({ id, nameEn, nameZh })) },
    );
    return data.updateStations;
  }

  /** The shop's add-ons. A server from before add-ons has none. */
  async getAddons(): Promise<Addon[]> {
    try {
      const data = await this.run<{ addons: Addon[] }>(`query Addons { addons { ${ADDON} } }`);
      return data.addons;
    } catch (error) {
      if (error instanceof DanError && error.code === "bad_response") return [];
      throw error;
    }
  }

  /** Owner only. */
  async updateAddons(addons: Addon[]): Promise<Addon[]> {
    const data = await this.run<{ updateAddons: Addon[] }>(`mutation UpdateAddons($addons: [AddonInput!]!) { updateAddons(addons: $addons) { ${ADDON} } }`, {
      addons: addons.map(({ id, nameEn, nameZh, scope, kind, value, auto, required, channels }) => ({ id, nameEn, nameZh, scope, kind, value, auto, required, channels })),
    });
    return data.updateAddons;
  }

  async setCounterPin(pin: string): Promise<void> {
    await this.run<{ setCounterPin: boolean }>(`mutation SetCounterPin($pin: String!) { setCounterPin(pin: $pin) }`, { pin });
  }

  async updateMenuItem(id: string, patch: MenuItemPatch): Promise<MenuItem> {
    // A query the server cannot read is refused before it runs: asking again saves once.
    const data = await this.withPhotos<{ updateMenuItem: MenuItem }>(
      (fields) => `mutation UpdateMenuItem($id: ID!, $patch: MenuItemPatch!) { updateMenuItem(id: $id, patch: $patch) { ${fields} } }`,
      { id, patch },
    );
    return data.updateMenuItem;
  }

  async getOrders(): Promise<{ orders: Order[] }> {
    try {
      return await this.run<{ orders: Order[] }>(`query Orders { orders { ${orderFields()} } }`);
    } catch (error) {
      // A shop server from before couriers (or delivery fees): ask for less from now on.
      if (orderLevel > 0 && error instanceof DanError && error.code === "bad_response") {
        orderLevel -= 1;
        return this.getOrders();
      }
      throw error;
    }
  }

  async getOrder(id: string): Promise<Order> {
    const data = await this.run<{ order: Order }>(`query Order($id: ID!) { order(id: $id) { ${orderFields()} } }`, { id });
    return data.order;
  }

  /** Owner only. */
  async editOrder(id: string, input: OrderEditInput): Promise<Order> {
    const data = await this.run<{ editOrder: Order }>(`mutation EditOrder($id: ID!, $input: OrderEditInput!) { editOrder(id: $id, input: $input) { ${orderFields()} } }`, { id, input });
    return data.editOrder;
  }

  /** Owner only. */
  async moveOrderTo(id: string, column: string): Promise<Order> {
    const data = await this.run<{ moveOrderTo: Order }>(`mutation MoveOrderTo($id: ID!, $column: ID!) { moveOrderTo(id: $id, column: $column) { ${orderFields()} } }`, { id, column });
    return data.moveOrderTo;
  }

  /** Owner only. Final. */
  cancelOrder(id: string): Promise<Order> {
    return this.courierAction("cancelOrder", id);
  }

  /** Owner only. */
  async getOrderEdits(orderId: string): Promise<OrderEdit[]> {
    const ask = (detail: boolean) => this.run<{ orderEdits: OrderEdit[] }>(`query OrderEdits($id: ID!) { orderEdits(orderId: $id) { ${orderEditFields(detail)} } }`, { id: orderId });
    try {
      return (await ask(true)).orderEdits;
    } catch (error) {
      // A shop server from before dish options keeps the record without each line's detail.
      if (error instanceof DanError && error.code === "bad_response") return (await ask(false)).orderEdits;
      throw error;
    }
  }

  /**
   * The order list. A shop server from before the list answers `bad_response`:
   * then the list is made from the orders the board has (`fallback`).
   */
  async getOrderHistory(filter: OrderHistoryFilter = {}, before?: string | null, limit: number = HISTORY_PAGE, fallback?: Order[]): Promise<OrderPage> {
    try {
      const data = await this.run<{ orderHistory: OrderPage }>(
        `query OrderHistory($filter: OrderHistoryFilter, $before: String, $limit: Int) { orderHistory(filter: $filter, before: $before, limit: $limit) { orders { ${orderFields()} } next } }`,
        { filter: { search: filter.search ?? null, day: filter.day || null, status: filter.status?.length ? filter.status : null }, before: before ?? null, limit },
      );
      return data.orderHistory;
    } catch (error) {
      if (fallback && error instanceof DanError && error.code === "bad_response") return historyPage(fallback, filter, before, limit);
      throw error;
    }
  }

  /** How the shop takes orders and payment. A shop server from before them: v0.1's defaults. */
  async getOrderingSettings(): Promise<OrderingSetup> {
    try {
      const data = await this.run<{ orderingSettings: OrderingSetup }>(`query Ordering { orderingSettings { ${ORDERING} } }`);
      return data.orderingSettings;
    } catch (error) {
      if (error instanceof DanError && error.code === "bad_response") return DEFAULT_SETUP;
      throw error;
    }
  }

  /** Owner only. `bank` replaces the bank details (all empty clears them); left out, they stay. */
  async updateOrderingSettings(settings: OrderingSettings, bank?: BankDetails | null): Promise<OrderingSetup> {
    const data = await this.run<{ updateOrderingSettings: OrderingSetup }>(
      `mutation SaveOrdering($settings: OrderingSettingsInput!, $bank: BankDetailsInput) { updateOrderingSettings(settings: $settings, bank: $bank) { ${ORDERING} } }`,
      { settings, bank: bank ?? null },
    );
    return data.updateOrderingSettings;
  }

  /** The ticket sounds. A shop server from before them: the kitchen 叮. */
  async getTriggers(): Promise<Triggers> {
    try {
      const data = await this.run<{ triggers: Triggers }>(`query Triggers { triggers { triggers { ${TRIGGER_FIELDS} } } }`);
      return data.triggers;
    } catch (error) {
      if (error instanceof DanError && error.code === "bad_response") return DEFAULT_TRIGGERS;
      throw error;
    }
  }

  /** Owner only. */
  async updateTriggers(triggers: Triggers): Promise<Triggers> {
    const data = await this.run<{ updateTriggers: Triggers }>(
      `mutation SaveTriggers($triggers: [TriggerInput!]!) { updateTriggers(triggers: $triggers) { triggers { ${TRIGGER_FIELDS} } } }`,
      { triggers: triggers.triggers },
    );
    return data.updateTriggers;
  }

  /** Owner only: back to the kitchen 叮. */
  async resetTriggers(): Promise<Triggers> {
    const data = await this.run<{ resetTriggers: Triggers }>(`mutation ResetTriggers { resetTriggers { triggers { ${TRIGGER_FIELDS} } } }`);
    return data.resetTriggers;
  }

  /** The owner's board columns. A shop server from before them: the four defaults. */
  async getBoard(): Promise<Board> {
    try {
      const data = await this.run<{ board: Board }>(`query Board { board { columns { ${BOARD_COLUMN} } } }`);
      return data.board;
    } catch (error) {
      if (error instanceof DanError && error.code === "bad_response") return DEFAULT_BOARD;
      throw error;
    }
  }

  /** Owner only. What saving these columns would do to the tickets on the board now. */
  async previewBoard(board: Board): Promise<BoardPreview> {
    const data = await this.run<{ previewBoard: BoardPreview }>(
      "query PreviewBoard($columns: [BoardColumnInput!]!) { previewBoard(columns: $columns) { moves { fromColumn toColumn tickets } stuckTickets } }",
      { columns: board.columns },
    );
    return data.previewBoard;
  }

  /** Owner only. `moveTickets`: the owner agreed to move tickets out of removed columns. */
  async updateBoard(board: Board, moveTickets: boolean): Promise<Board> {
    const data = await this.run<{ updateBoard: Board }>(
      `mutation SaveBoard($columns: [BoardColumnInput!]!, $moveTickets: Boolean) { updateBoard(columns: $columns, moveTickets: $moveTickets) { columns { ${BOARD_COLUMN} } } }`,
      { columns: board.columns, moveTickets },
    );
    return data.updateBoard;
  }

  async resetBoard(): Promise<Board> {
    const data = await this.run<{ resetBoard: Board }>(`mutation ResetBoard { resetBoard { columns { ${BOARD_COLUMN} } } }`);
    return data.resetBoard;
  }

  /** Moves a ticket to the next column. A shop server from before columns: by status. */
  async moveOrder(id: string, column: string, status: OrderStatus): Promise<Order> {
    try {
      const data = await this.run<{ moveOrder: Order }>(
        `mutation MoveOrder($id: ID!, $column: ID!) { moveOrder(id: $id, column: $column) { ${orderFields()} } }`,
        { id, column },
      );
      return data.moveOrder;
    } catch (error) {
      if (error instanceof DanError && error.code === "bad_response") return this.updateOrder(id, { status });
      throw error;
    }
  }

  /** The shop's Uber Direct options. A shop server from before them: not connected. */
  async getUberOptions(): Promise<UberOptions> {
    try {
      const data = await this.run<{ uberOptions: UberOptions }>(`query Uber { uberOptions { ${UBER_FIELDS} } }`);
      return data.uberOptions;
    } catch (error) {
      if (error instanceof DanError && error.code === "bad_response") return DEFAULT_UBER;
      throw error;
    }
  }

  /** Owner only. */
  async updateUberOptions(input: UberOptionsInput): Promise<UberOptions> {
    const data = await this.run<{ updateUberOptions: UberOptions }>(
      `mutation SaveUber($input: UberOptionsInput!) { updateUberOptions(input: $input) { ${UBER_FIELDS} } }`,
      { input },
    );
    return data.updateUberOptions;
  }

  /** Owner only, on the Dan cloud. */
  async connectUber(keys: UberKeys): Promise<UberOptions> {
    const data = await this.run<{ connectUber: UberOptions }>(
      `mutation ConnectUber($keys: UberKeysInput!) { connectUber(keys: $keys) { ${UBER_FIELDS} } }`,
      { keys },
    );
    return data.connectUber;
  }

  /** Owner only, on the Dan cloud. */
  async disconnectUber(): Promise<UberOptions> {
    const data = await this.run<{ disconnectUber: UberOptions }>(`mutation DisconnectUber { disconnectUber { ${UBER_FIELDS} } }`);
    return data.disconnectUber;
  }

  /** A courier request or a change to a delivery: book, cancel the courier, collect, cancel the order, or who delivers. */
  async courierAction(action: CourierAction, id: string): Promise<Order> {
    const call = {
      book: "bookCourier(id: $id)",
      cancelCourier: "cancelCourier(id: $id)",
      toCollection: "changeToCollection(id: $id)",
      cancelOrder: "cancelOrder(id: $id)",
      byShop: "setDeliveryBy(id: $id, by: shop)",
      byUber: "setDeliveryBy(id: $id, by: uber_direct)",
    }[action];
    const data = await this.run<Record<string, Order>>(`mutation Courier($id: ID!) { result: ${call} { ${orderFields()} } }`, { id });
    return data.result;
  }

  /** Bank transfers waiting for staff (on the Dan cloud, where customers' orders are taken). */
  async getAwaitingPayments(): Promise<AwaitingPayment[]> {
    const data = await this.run<{ awaitingPayments: AwaitingPayment[] }>(
      "query Awaiting { awaitingPayments { id reference customerName phone fulfilment table address totalPence createdAt expiresAt lines { number nameEn nameZh qty unitPricePence } } }",
    );
    return data.awaitingPayments;
  }

  async markBankTransferPaid(id: string): Promise<void> {
    await this.run("mutation Paid($id: ID!) { markBankTransferPaid(id: $id) { id } }", { id });
  }

  async rejectBankTransfer(id: string): Promise<void> {
    await this.run("mutation Reject($id: ID!) { rejectBankTransfer(id: $id) }", { id });
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const data = await this.run<{ createOrder: Order }>(
      `mutation CreateOrder($input: CreateOrderInput!) { createOrder(input: $input) { ${orderFields()} } }`,
      { input },
    );
    return data.createOrder;
  }

  async updateOrder(id: string, patch: { status: OrderStatus }): Promise<Order> {
    const data = await this.run<{ updateOrder: Order }>(
      `mutation UpdateOrder($id: ID!, $status: OrderStatus!) { updateOrder(id: $id, status: $status) { ${orderFields()} } }`,
      { id, status: patch.status },
    );
    return data.updateOrder;
  }

  async getCustomers(query?: { phone?: string }): Promise<{ customers: Customer[] }> {
    return this.run<{ customers: Customer[] }>(
      `query Customers($phone: String) { customers(phone: $phone) { ${CUSTOMER} } }`,
      { phone: query?.phone ?? null },
    );
  }

  async createCustomer(input: { phone: string; name: string }): Promise<Customer> {
    const data = await this.run<{ createCustomer: Customer }>(
      `mutation CreateCustomer($phone: String!, $name: String!) { createCustomer(phone: $phone, name: $name) { ${CUSTOMER} } }`,
      input,
    );
    return data.createCustomer;
  }

  async addStamp(phone: string): Promise<Customer> {
    const data = await this.run<{ addStamp: Customer }>(
      `mutation AddStamp($phone: String!) { addStamp(phone: $phone) { ${CUSTOMER} } }`,
      { phone },
    );
    return data.addStamp;
  }

  async redeemReward(phone: string): Promise<Customer> {
    const data = await this.run<{ redeemReward: Customer }>(
      `mutation RedeemReward($phone: String!) { redeemReward(phone: $phone) { ${CUSTOMER} } }`,
      { phone },
    );
    return data.redeemReward;
  }

  async getTheme(): Promise<ThemeChoice> {
    const data = await this.run<{ theme: ThemeChoice }>(`query Theme { theme { ${THEME} } }`);
    return normalizeTheme(data.theme);
  }

  async updateTheme(theme: ThemeChoice): Promise<ThemeChoice> {
    const data = await this.run<{ updateTheme: ThemeChoice }>(
      `mutation UpdateTheme($theme: ThemeInput!) { updateTheme(theme: $theme) { ${THEME} } }`,
      { theme: { preset: theme.preset, typeface: theme.typeface, custom: theme.custom } },
    );
    return normalizeTheme(data.updateTheme);
  }

  /** Any signed-in staff. For the status corner; not part of DanClient. */
  async getSyncStatus(): Promise<SyncStatus> {
    const data = await this.run<{ syncStatus: SyncStatus }>("query SyncStatus { syncStatus { mode pending lastSyncedAt } }");
    return data.syncStatus;
  }

  async getSales(range: SalesRange): Promise<SalesSummary> {
    const data = await this.run<{ sales: SalesSummary }>(
      `query Sales($range: SalesRange!) { sales(range: $range) { ${SALES} } }`,
      { range },
    );
    return data.sales;
  }
}

/**
 * Sends a dish photo to the shop's staff API on the Dan cloud (owner only).
 * Photos are added only there: a shop's own server answers photos_cloud_only.
 */
export type CourierAction = "book" | "cancelCourier" | "toCollection" | "cancelOrder" | "byShop" | "byUber";

export async function uploadMenuPhoto(base: string, token: string, itemId: string, photo: Blob, fetchImpl: typeof fetch = fetch): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(`${base}/photos/${encodeURIComponent(itemId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": photo.type || "image/jpeg" },
      body: photo,
      credentials: "omit",
    });
  } catch {
    throw new DanError("unreachable", "The Dan cloud could not be reached. Check the internet connection.");
  }
  const body = (await response.json().catch(() => null)) as { photo?: string; code?: string; message?: string } | null;
  if (!response.ok || !body?.photo) {
    throw new DanError(body?.code ?? "photo_failed", body?.message ?? "The photo was not saved. Try again.");
  }
  return body.photo;
}
