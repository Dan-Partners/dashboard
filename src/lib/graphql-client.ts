import { asDanError, DanError } from "./errors";
import { normalizeServerUrl } from "./url";
import type {
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
  SalesRange,
  SalesSummary,
  ServerPing,
} from "./types";
import { DAN_PRODUCT } from "./types";

/**
 * Talks to a Dan shop server over GraphQL. The wire contract is
 * `schema.graphql` in https://github.com/DanPartners/server; this file asks
 * for exactly the fields the types in ./types.ts declare.
 */

const PING_TIMEOUT_MS = 6000;

const SHOP = "id name nameZh address city phone";
const STAFF = "id name role";
const MENU_ITEM =
  "id number categoryId nameEn nameZh descriptionEn pricePence station allergens soldOut kind includes { number qty }";
const ORDER = `id number createdAt source fulfilment status customerName phone address notes totalPence
  lines { itemId number nameEn nameZh qty unitPricePence station kind components { number nameEn nameZh qty station } }`;
const CUSTOMER = "id phone name stamps rewardsRedeemed createdAt";
const SALES =
  "range orderCount totalPence averagePence collectionCount deliveryCount openCount topItems { number nameEn nameZh qty totalPence }";

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
      `query Ping { ping { ok product version shop { ${SHOP} } auth { password pin } } }`,
      {},
      { fetchImpl, signal: controller.signal },
    );
    const ping = data.ping;
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

  async getMenu(): Promise<MenuPayload> {
    const data = await this.run<{ menu: MenuPayload }>(
      `query Menu { menu { categories { id nameEn nameZh sort } items { ${MENU_ITEM} } } }`,
    );
    return data.menu;
  }

  async updateMenuItem(id: string, patch: MenuItemPatch): Promise<MenuItem> {
    const data = await this.run<{ updateMenuItem: MenuItem }>(
      `mutation UpdateMenuItem($id: ID!, $patch: MenuItemPatch!) { updateMenuItem(id: $id, patch: $patch) { ${MENU_ITEM} } }`,
      { id, patch },
    );
    return data.updateMenuItem;
  }

  async getOrders(): Promise<{ orders: Order[] }> {
    return this.run<{ orders: Order[] }>(`query Orders { orders { ${ORDER} } }`);
  }

  async createOrder(input: CreateOrderInput): Promise<Order> {
    const data = await this.run<{ createOrder: Order }>(
      `mutation CreateOrder($input: CreateOrderInput!) { createOrder(input: $input) { ${ORDER} } }`,
      { input },
    );
    return data.createOrder;
  }

  async updateOrder(id: string, patch: { status: OrderStatus }): Promise<Order> {
    const data = await this.run<{ updateOrder: Order }>(
      `mutation UpdateOrder($id: ID!, $status: OrderStatus!) { updateOrder(id: $id, status: $status) { ${ORDER} } }`,
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

  async getSales(range: SalesRange): Promise<SalesSummary> {
    const data = await this.run<{ sales: SalesSummary }>(
      `query Sales($range: SalesRange!) { sales(range: $range) { ${SALES} } }`,
      { range },
    );
    return data.sales;
  }
}
