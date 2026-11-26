import { asDanError, DanError } from "./errors";
import { normalizeServerUrl } from "./url";
import type {
  BackupStatus,
  CreateOrderInput,
  Customer,
  DanClient,
  LoginInput,
  LoginResult,
  MenuItem,
  MenuItemPatch,
  MenuPayload,
  Order,
  OrderStatus,
  Printer,
  PrinterInput,
  PrinterStatus,
  SalesRange,
  SalesSummary,
  SyncStatus,
  ServerPing,
} from "./types";
import { DAN_PRODUCT } from "./types";
import { normalizeTheme, type ThemeChoice } from "./theme";

/**
 * Talks to a Dan shop server over GraphQL. The wire contract is
 * `schema.graphql` in https://github.com/DanPartners/server; this file asks
 * for exactly the fields the types in ./types.ts declare.
 */

const PING_TIMEOUT_MS = 6000;

const SHOP = "id name nameZh address city phone";
const THEME = "preset typeface custom { paper ink accent chrome }";
const STAFF = "id name role";
const MENU_ITEM_BASE =
  "id number categoryId nameEn nameZh descriptionEn pricePence station allergens soldOut kind includes { number qty }";
const MENU_ITEM = `${MENU_ITEM_BASE} photo`;
const PRINTER = "id name host port paper stations copies enabled";
/** The order fields the dashboard uses, for queries and the live channel alike. */
export const ORDER_FIELDS = `id number createdAt source fulfilment status customerName phone address notes table totalPence payment { method status }
  lines { itemId number nameEn nameZh qty unitPricePence station kind components { number nameEn nameZh qty station } }`;
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
    try {
      return await this.run<T>(query(MENU_ITEM), variables);
    } catch (error) {
      if (error instanceof DanError && error.code === "bad_response") return this.run<T>(query(MENU_ITEM_BASE), variables);
      throw error;
    }
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

  async updateMenuItem(id: string, patch: MenuItemPatch): Promise<MenuItem> {
    // A query the server cannot read is refused before it runs: asking again saves once.
    const data = await this.withPhotos<{ updateMenuItem: MenuItem }>(
      (fields) => `mutation UpdateMenuItem($id: ID!, $patch: MenuItemPatch!) { updateMenuItem(id: $id, patch: $patch) { ${fields} } }`,
      { id, patch },
    );
    return data.updateMenuItem;
  }

  async getOrders(): Promise<{ orders: Order[] }> {
    return this.run<{ orders: Order[] }>(`query Orders { orders { ${ORDER_FIELDS} } }`);
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const data = await this.run<{ createOrder: Order }>(
      `mutation CreateOrder($input: CreateOrderInput!) { createOrder(input: $input) { ${ORDER_FIELDS} } }`,
      { input },
    );
    return data.createOrder;
  }

  async updateOrder(id: string, patch: { status: OrderStatus }): Promise<Order> {
    const data = await this.run<{ updateOrder: Order }>(
      `mutation UpdateOrder($id: ID!, $status: OrderStatus!) { updateOrder(id: $id, status: $status) { ${ORDER_FIELDS} } }`,
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

  /** Owner only. Not part of DanClient: see BackupStatus. */
  async getBackupStatus(): Promise<BackupStatus> {
    const data = await this.run<{ backupStatus: BackupStatus }>(
      "query BackupStatus { backupStatus { health lastRunAt lastSuccessAt lastResult } }",
    );
    return data.backupStatus;
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
