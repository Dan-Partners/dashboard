import { checkTriggers, DEFAULT_TRIGGERS, normalizeTriggers, type Triggers } from "./triggers";
import { checkBoard, columnOf, DEFAULT_BOARD, nextAfter, normalizeBoard, planMoves, roleOf, startFor, statusAfter, summarise, type Board, type BoardPreview, type PlannedMove } from "./board";
import { bankIsEmpty, checkedBank, checkOrdering, normalizeSetup, type BankDetails, type OrderingSettings, type OrderingSetup } from "./ordering";
import { DanError } from "./errors";
import { phoneDigits } from "./format";
import { summarizeSales } from "./sales";
import {
  API_VERSION,
  createSeedState,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_PIN,
  type DemoState,
  STAMP_GOAL,
} from "./seed";
import type {
  CreateOrderInput,
  Customer,
  DanClient,
  LoginInput,
  LoginResult,
  MenuItem,
  MenuItemPatch,
  Order,
  OrderLine,
  OrderStatus,
  SalesRange,
  ServerPing,
  TicketComponent,
} from "./types";
import { ALLERGENS, FULFILMENTS, ORDER_SOURCES, ORDER_STATUSES, STATIONS } from "./types";
import { normalizeTheme, type ThemeChoice } from "./theme";

const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  new: "preparing",
  preparing: "ready",
  ready: "completed",
  completed: null,
  cancelled: null,
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function componentsFor(item: MenuItem, menu: MenuItem[], qty: number): TicketComponent[] {
  return item.includes.map((include) => {
    const part = menu.find((entry) => entry.number === include.number);
    if (!part) {
      throw new DanError("bad_item", `Set ${item.number} refers to a missing dish.`);
    }
    if (part.soldOut) {
      throw new DanError("sold_out", `${part.number} ${part.nameEn} is sold out.`);
    }
    return {
      number: part.number,
      nameEn: part.nameEn,
      nameZh: part.nameZh,
      qty: include.qty * qty,
      station: part.station,
    };
  });
}

function toLine(item: MenuItem, menu: MenuItem[], qty: number): OrderLine {
  return {
    itemId: item.id,
    number: item.number,
    nameEn: item.nameEn,
    nameZh: item.nameZh,
    qty,
    unitPricePence: item.pricePence,
    station: item.station,
    kind: item.kind,
    components: item.kind === "set" ? componentsFor(item, menu, qty) : [],
  };
}

export class MockDanServer implements DanClient {
  private state: DemoState;
  private readonly now: () => Date;

  constructor(options?: { state?: DemoState; now?: () => Date }) {
    this.now = options?.now ?? (() => new Date());
    this.state = options?.state ? clone(options.state) : createSeedState(this.now());
  }

  getState(): DemoState {
    return clone(this.state);
  }

  demoSession(): LoginResult {
    return {
      token: "dan-demo-token",
      staff: clone(this.state.staff),
      shop: clone(this.state.shop),
    };
  }

  ping(): Promise<ServerPing> {
    return Promise.resolve({
      ok: true,
      product: "dan",
      version: API_VERSION,
      shop: clone(this.state.shop),
      auth: { password: true, pin: true },
    });
  }

  login(input: LoginInput): Promise<LoginResult> {
    const pinOk = "pin" in input && input.pin === DEMO_PIN;
    const passwordOk =
      "email" in input &&
      input.email?.trim().toLowerCase() === DEMO_EMAIL &&
      input.password === DEMO_PASSWORD;
    if (!pinOk && !passwordOk) {
      return Promise.reject(new DanError("unauthorized", "Those details were not recognised."));
    }
    return Promise.resolve(this.demoSession());
  }

  logout(): Promise<void> {
    return Promise.resolve();
  }

  getMenu() {
    return Promise.resolve({
      categories: clone(this.state.categories),
      items: clone(this.state.items),
    });
  }

  updateMenuItem(id: string, patch: MenuItemPatch): Promise<MenuItem> {
    const index = this.state.items.findIndex((item) => item.id === id);
    if (index < 0) return Promise.reject(new DanError("not_found", "That dish is not on the menu."));
    const current = this.state.items[index];
    const next: MenuItem = { ...current, ...patch, id: current.id, includes: current.includes, kind: current.kind };

    if (!Number.isInteger(next.number) || next.number < 1 || next.number > 999) {
      return Promise.reject(new DanError("invalid", "Dish numbers run from 1 to 999."));
    }
    if (this.state.items.some((item) => item.id !== id && item.number === next.number)) {
      return Promise.reject(new DanError("duplicate_number", "That number is already on the menu."));
    }
    if (!next.nameEn.trim() || !next.nameZh.trim()) {
      return Promise.reject(new DanError("invalid", "A dish needs an English name and a Chinese name."));
    }
    if (!Number.isInteger(next.pricePence) || next.pricePence < 0 || next.pricePence > 100_000) {
      return Promise.reject(new DanError("invalid", "Check the price."));
    }
    if (!STATIONS.includes(next.station)) {
      return Promise.reject(new DanError("invalid", "Choose a station."));
    }
    if (!this.state.categories.some((category) => category.id === next.categoryId)) {
      return Promise.reject(new DanError("invalid", "Choose a category."));
    }
    if (next.allergens.some((allergen) => !ALLERGENS.includes(allergen))) {
      return Promise.reject(new DanError("invalid", "Unknown allergen."));
    }

    next.nameEn = next.nameEn.trim();
    next.nameZh = next.nameZh.trim();
    next.descriptionEn = next.descriptionEn.trim();
    this.state.items[index] = next;
    return Promise.resolve(clone(next));
  }

  getOrders() {
    const orders = clone(this.state.orders).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return Promise.resolve({ orders });
  }

  getOrderingSettings(): Promise<OrderingSetup> {
    return Promise.resolve(clone(normalizeSetup(this.state.ordering)));
  }

  /** The demo signs in as the owner, so it may change them; the same checks as the shop server. */
  updateOrderingSettings(settings: OrderingSettings, bank?: BankDetails | null): Promise<OrderingSetup> {
    try {
      const current = normalizeSetup(this.state.ordering);
      const nextBank = bank === undefined ? current.bank : bankIsEmpty(bank) ? null : checkedBank(bank!);
      checkOrdering(settings, nextBank, false);
      this.state.ordering = { settings: clone(settings), bank: nextBank, uberReady: false };
      return Promise.resolve(clone(this.state.ordering));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  createOrder(input: CreateOrderInput): Promise<Order> {
    if (!ORDER_SOURCES.includes(input.source) || !FULFILMENTS.includes(input.fulfilment)) {
      return Promise.reject(new DanError("invalid", "Choose collection or delivery."));
    }
    const rules = normalizeSetup(this.state.ordering).settings;
    if (input.source !== "online" && !rules.till) {
      return Promise.reject(new DanError("till_off", "The till is switched off for this shop."));
    }
    // The demo's own online orders follow the owner's methods, as the cloud would.
    if (input.source === "online") {
      const allowed = input.table ? rules.table : input.fulfilment === "delivery" ? rules.delivery : rules.collection;
      if (!allowed) return Promise.reject(new DanError("method_off", "This shop is not taking that kind of order."));
    }
    const table = input.table?.split(/\s+/).filter(Boolean).join(" ") || null;
    if (table && ([...table].length > 10 || !/^[\p{L}\p{N} -]+$/u.test(table))) {
      return Promise.reject(new DanError("bad_table", "A table name is up to 10 letters, numbers, spaces or hyphens."));
    }
    if (!input.lines.length) {
      return Promise.reject(new DanError("invalid", "Add a dish before sending."));
    }

    const lines: OrderLine[] = [];
    for (const requested of input.lines) {
      if (!Number.isInteger(requested.qty) || requested.qty < 1 || requested.qty > 99) {
        return Promise.reject(new DanError("invalid", "Quantity must be between 1 and 99."));
      }
      const item = this.state.items.find((entry) => entry.number === requested.number);
      if (!item) {
        return Promise.reject(new DanError("unknown_item", `No dish with number ${requested.number}.`));
      }
      if (item.soldOut) {
        return Promise.reject(new DanError("sold_out", `${item.number} ${item.nameEn} is sold out.`));
      }
      try {
        lines.push(toLine(item, this.state.items, requested.qty));
      } catch (error) {
        return Promise.reject(error);
      }
    }

    const number = this.state.nextOrderNumber;
    this.state.nextOrderNumber += 1;
    const order: Order = {
      id: `ord-${number}`,
      number,
      createdAt: this.now().toISOString(),
      source: input.source,
      fulfilment: input.fulfilment,
      status: input.source === "online" ? "new" : "preparing",
      customerName: input.customerName?.trim() ?? "",
      phone: input.phone?.trim() ?? "",
      address: input.address?.trim() ?? "",
      notes: input.notes?.trim() ?? "",
      table,
      lines,
      totalPence: lines.reduce((sum, line) => sum + line.qty * line.unitPricePence, 0),
      // Online orders in the demo alternate between the ways the shop takes payment.
      payment: input.source === "online" ? demoPayment(rules, number) : null,
      column: startFor(normalizeBoard(this.state.board), input.source).id,
      columnAt: this.now().toISOString(),
    };
    this.state.orders.unshift(order);
    return Promise.resolve(clone(order));
  }

  getTriggers(): Promise<Triggers> {
    return Promise.resolve(clone(normalizeTriggers(this.state.triggers)));
  }

  /** The demo signs in as the owner; the same checks as the shop server. */
  updateTriggers(triggers: Triggers): Promise<Triggers> {
    try {
      this.state.triggers = checkTriggers(triggers);
      return Promise.resolve(clone(this.state.triggers));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  resetTriggers(): Promise<Triggers> {
    this.state.triggers = clone(DEFAULT_TRIGGERS);
    return Promise.resolve(clone(DEFAULT_TRIGGERS));
  }

  getBoard(): Promise<Board> {
    return Promise.resolve(clone(normalizeBoard(this.state.board)));
  }

  /** The demo signs in as the owner; the same checks and ticket moves as the shop server. */
  previewBoard(board: Board): Promise<BoardPreview> {
    try {
      const next = checkBoard(board);
      const { moves, stuck } = planMoves(normalizeBoard(this.state.board), next, this.state.orders);
      return Promise.resolve({ moves: summarise(moves), stuckTickets: stuck });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  updateBoard(board: Board, moveTickets: boolean): Promise<Board> {
    try {
      const next = checkBoard(board);
      const { moves, stuck } = planMoves(normalizeBoard(this.state.board), next, this.state.orders);
      if (stuck > 0) throw new DanError("board_tickets_stuck", `${stuck} tickets are in a column being removed and cannot go back a step. Move them on first.`);
      if (moves.length && !moveTickets) throw new DanError("board_has_tickets", `${moves.length} tickets are in columns being removed.`);
      this.state.board = next;
      this.remap(moves);
      return Promise.resolve(clone(next));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  resetBoard(): Promise<Board> {
    const current = normalizeBoard(this.state.board);
    const moves: PlannedMove[] = [];
    for (const order of this.state.orders) {
      if (!["new", "preparing", "ready"].includes(order.status)) continue;
      const at = columnOf(current, order);
      const target = at ? DEFAULT_BOARD.columns.find((column) => column.role === at.role) : undefined;
      if (at && target && order.column !== target.id) moves.push({ orderId: order.id, from: at.id, to: target.id });
    }
    this.state.board = clone(DEFAULT_BOARD);
    this.remap(moves);
    return Promise.resolve(clone(DEFAULT_BOARD));
  }

  private remap(moves: PlannedMove[]) {
    const at = this.now().toISOString();
    for (const move of moves) {
      const order = this.state.orders.find((entry) => entry.id === move.orderId);
      if (order) Object.assign(order, { column: move.to, columnAt: at, columnRemap: true });
    }
  }

  /** Moves a ticket to the next column, one step at a time. */
  moveOrder(id: string, to: string): Promise<Order> {
    const order = this.state.orders.find((entry) => entry.id === id);
    if (!order) return Promise.reject(new DanError("not_found", "That order is not on the board."));
    const board = normalizeBoard(this.state.board);
    const here = columnOf(board, order);
    if (!here || order.status === "completed") return Promise.reject(new DanError("order_finished", "That order is finished."));
    const forward = nextAfter(board, here.id);
    const at = board.columns.findIndex((column) => column.id === here.id);
    const before = at > 0 && board.columns[at - 1].role === here.role ? board.columns[at - 1] : null;
    const next = forward?.id === to ? forward : before?.id === to ? before : null;
    if (!next) return Promise.reject(new DanError("bad_status", "Move the order one step at a time; back only within the same stage."));
    Object.assign(order, { column: next.id, columnAt: this.now().toISOString(), columnRemap: false, status: statusAfter(order, next) });
    return Promise.resolve(clone(order));
  }

  /** The demo has no Uber account: it can only change a delivery to collection, or cancel an order. */
  courierAction(action: "book" | "cancelCourier" | "toCollection" | "cancelOrder" | "byShop" | "byUber", id: string): Promise<Order> {
    const order = this.state.orders.find((entry) => entry.id === id);
    if (!order) return Promise.reject(new DanError("not_found", "That order is not on the board."));
    if (order.status === "completed" || order.status === "cancelled") {
      return Promise.reject(new DanError("order_finished", "That order is finished."));
    }
    if (action === "cancelOrder") {
      order.status = "cancelled";
      if (order.payment?.method === "card" && order.payment.status === "paid") order.refund = "refunded";
    } else if (action === "toCollection" && order.fulfilment === "delivery") {
      order.fulfilment = "collection";
    } else if (action === "byShop" && order.fulfilment === "delivery") {
      order.deliveryBy = "shop";
    } else {
      return Promise.reject(new DanError("uber_demo", "Uber Direct is not in the demo."));
    }
    return Promise.resolve(clone(order));
  }

  updateOrder(id: string, patch: { status: OrderStatus }): Promise<Order> {
    const order = this.state.orders.find((entry) => entry.id === id);
    if (!order) return Promise.reject(new DanError("not_found", "That order is not on the board."));
    if (!(ORDER_STATUSES as readonly string[]).includes(patch.status)) {
      return Promise.reject(new DanError("invalid", "Unknown status."));
    }
    if (NEXT_STATUS[order.status] !== patch.status) {
      return Promise.reject(new DanError("bad_status", "Move the order on one step at a time."));
    }
    order.status = patch.status;
    const column = normalizeBoard(this.state.board).columns.find((entry) => entry.role === roleOf(patch.status));
    if (column) Object.assign(order, { column: column.id, columnAt: this.now().toISOString(), columnRemap: false });
    return Promise.resolve(clone(order));
  }

  getCustomers(query?: { phone?: string }) {
    const digits = query?.phone ? phoneDigits(query.phone) : "";
    const customers = this.state.customers.filter((customer) =>
      digits ? customer.id.includes(digits) : true,
    );
    return Promise.resolve({ customers: clone(customers) });
  }

  createCustomer(input: { phone: string; name: string }): Promise<Customer> {
    const digits = phoneDigits(input.phone);
    if (digits.length < 7) {
      return Promise.reject(new DanError("invalid", "Enter a phone number."));
    }
    const name = input.name.trim();
    if (!name) return Promise.reject(new DanError("invalid", "Enter a name to open a card."));
    const existing = this.state.customers.find((customer) => customer.id === digits);
    if (existing) {
      existing.name = name;
      existing.phone = input.phone.trim();
      return Promise.resolve(clone(existing));
    }
    const customer: Customer = {
      id: digits,
      phone: input.phone.trim(),
      name,
      stamps: 0,
      rewardsRedeemed: 0,
      createdAt: this.now().toISOString(),
    };
    this.state.customers.unshift(customer);
    return Promise.resolve(clone(customer));
  }

  addStamp(phone: string): Promise<Customer> {
    const customer = this.findOrCreate(phone);
    if (!customer) return Promise.reject(new DanError("invalid", "Enter a phone number."));
    if (customer.stamps >= STAMP_GOAL) {
      return Promise.reject(
        new DanError("reward_pending", "This card is full. Redeem it before adding another stamp."),
      );
    }
    customer.stamps += 1;
    return Promise.resolve(clone(customer));
  }

  redeemReward(phone: string): Promise<Customer> {
    const customer = this.state.customers.find((entry) => entry.id === phoneDigits(phone));
    if (!customer) return Promise.reject(new DanError("not_found", "No card for that number."));
    if (customer.stamps < STAMP_GOAL) {
      return Promise.reject(new DanError("no_reward", "This card is not full yet."));
    }
    customer.stamps = 0;
    customer.rewardsRedeemed += 1;
    return Promise.resolve(clone(customer));
  }

  getTheme(): Promise<ThemeChoice> {
    return Promise.resolve(normalizeTheme(this.state.theme));
  }

  updateTheme(theme: ThemeChoice): Promise<ThemeChoice> {
    this.state.theme = normalizeTheme(theme);
    return Promise.resolve(clone(this.state.theme));
  }

  getSales(range: SalesRange) {
    return Promise.resolve(summarizeSales(this.state.orders, range, this.now()));
  }

  private findOrCreate(phone: string): Customer | null {
    const digits = phoneDigits(phone);
    if (digits.length < 7) return null;
    const existing = this.state.customers.find((customer) => customer.id === digits);
    if (existing) return existing;
    const created: Customer = {
      id: digits,
      phone: phone.trim(),
      name: "Regular",
      stamps: 0,
      rewardsRedeemed: 0,
      createdAt: this.now().toISOString(),
    };
    this.state.customers.unshift(created);
    return created;
  }
}

function demoPayment(rules: OrderingSettings, number: number): Order["payment"] {
  const ways: NonNullable<Order["payment"]>[] = [];
  if (rules.stripe) ways.push({ method: "card", status: "paid" });
  if (rules.payInPerson) ways.push({ method: "at_shop", status: "due" });
  if (rules.bankTransfer) ways.push({ method: "bank_transfer", status: "paid" });
  return ways.length ? ways[number % ways.length] : { method: "at_shop", status: "due" };
}
