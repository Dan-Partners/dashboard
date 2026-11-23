import { asDanError, DanError } from "./errors";
import { normalizeServerUrl } from "./url";
import type {
  ApiErrorBody,
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

const PING_TIMEOUT_MS = 6000;

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DanError("bad_response", "The server answered in a way Dan could not read.");
  }
}

function errorFromBody(status: number, body: unknown): DanError {
  const parsed = body as ApiErrorBody | null;
  const code = parsed?.error?.code ?? (status === 401 ? "unauthorized" : "bad_response");
  const message =
    parsed?.error?.message ??
    (status === 401 ? "Those details were not recognised." : "The server could not do that.");
  return new DanError(code, message);
}

export async function pingServer(input: string, fetchImpl: typeof fetch = fetch): Promise<ServerPing> {
  const base = normalizeServerUrl(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${base}/api/server/ping`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = null;
      }
    }
    const ping = body as ServerPing | null;
    if (!response.ok || !ping || ping.ok !== true || ping.product !== DAN_PRODUCT || !ping.shop?.name) {
      throw new DanError("not_dan", "That address answered, but it is not a Dan server.");
    }
    return ping;
  } catch (error) {
    if (error instanceof DanError) throw error;
    throw asDanError(error);
  } finally {
    clearTimeout(timer);
  }
}

export class HttpDanClient implements DanClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string | null,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: {
          accept: "application/json",
          ...(init?.body ? { "content-type": "application/json" } : {}),
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
          ...init?.headers,
        },
        cache: "no-store",
      });
    } catch (error) {
      throw asDanError(error);
    }
    const body = await readBody(response);
    if (!response.ok) throw errorFromBody(response.status, body);
    return body as T;
  }

  ping() {
    return pingServer(this.baseUrl, this.fetchImpl);
  }

  login(input: LoginInput): Promise<LoginResult> {
    return this.request("/api/auth/login", { method: "POST", body: JSON.stringify(input) });
  }

  logout() {
    return this.request<void>("/api/auth/logout", { method: "POST" });
  }

  getMenu() {
    return this.request<MenuPayload>("/api/menu");
  }

  updateMenuItem(id: string, patch: MenuItemPatch) {
    return this.request<MenuItem>(`/api/menu/items/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  getOrders() {
    return this.request<{ orders: Order[] }>("/api/orders");
  }

  createOrder(input: CreateOrderInput) {
    return this.request<Order>("/api/orders", { method: "POST", body: JSON.stringify(input) });
  }

  updateOrder(id: string, patch: { status: OrderStatus }) {
    return this.request<Order>(`/api/orders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  getCustomers(query?: { phone?: string }) {
    const search = query?.phone ? `?phone=${encodeURIComponent(query.phone)}` : "";
    return this.request<{ customers: Customer[] }>(`/api/customers${search}`);
  }

  createCustomer(input: { phone: string; name: string }) {
    return this.request<Customer>("/api/customers", { method: "POST", body: JSON.stringify(input) });
  }

  addStamp(phone: string) {
    return this.request<Customer>(`/api/customers/${encodeURIComponent(phone)}/stamps`, { method: "POST" });
  }

  redeemReward(phone: string) {
    return this.request<Customer>(`/api/customers/${encodeURIComponent(phone)}/redeem`, { method: "POST" });
  }

  getSales(range: SalesRange) {
    return this.request<SalesSummary>(`/api/sales?range=${range}`);
  }
}
