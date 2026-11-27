import { applyEdit, cancelPlan, courierBooked, type Applied, type OrderEdit, type OrderEditInput } from "./order-edit";
import { historyPage, type OrderHistoryFilter, type OrderPage } from "./history";
import { checkPlaces, checkTriggers, DEFAULT_TRIGGERS, normalizeTriggers, onlyOn, type Triggers } from "./triggers";
import { checkViews, followBoard, kitchenAndPass, normalizeViews, type View } from "./views";
import { checkBoard, columnOf, DEFAULT_BOARD, nextAfter, normalizeBoard, planMoves, roleOf, startFor, statusAfter, statusOf, summarise, type Board, type BoardPreview, type PlannedMove } from "./board";
import { bankIsEmpty, checkedBank, checkOrdering, normalizeSetup, type BankDetails, type OrderingSettings, type OrderingSetup } from "./ordering";
import { checkAddons, checkOptions, normalizeAddons } from "./addons";
import { DanError } from "./errors";
import { phoneDigits } from "./format";
import { price } from "./pricing";
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
  Addon,
  Category,
  CategoryNames,
  CreateOrderInput,
  Customer,
  DanClient,
  LoginInput,
  LoginResult,
  MenuItem,
  MenuItemPatch,
  NewMenuItem,
  Order,
  OrderStatus,
  SalesRange,
  ServerPing,
  Shop,
  ShopPatch,
  Station,
} from "./types";
import { ALLERGENS, DEFAULT_STATIONS, FULFILMENTS, ORDER_SOURCES, ORDER_STATUSES } from "./types";
import { checkRemovals, checkStations, normalizeStations } from "./stations";
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

/** One name for both languages when only one was given. */
function bothNames(nameEn: string, nameZh: string): [string, string] {
  const en = nameEn.trim();
  const zh = nameZh.trim();
  if (en && !zh) return [en, en];
  if (zh && !en) return [zh, zh];
  return [en, zh];
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
    // A dish with one name for both languages keeps one name when it is renamed.
    next.nameEn = next.nameEn.trim();
    next.nameZh = next.nameZh.trim();
    const mirrored = current.nameEn === current.nameZh;
    if (!next.nameZh || (mirrored && next.nameEn !== current.nameEn && next.nameZh === current.nameZh)) next.nameZh = next.nameEn;
    if (!next.nameEn) next.nameEn = next.nameZh;

    if (!Number.isInteger(next.number) || next.number < 1 || next.number > 999) {
      return Promise.reject(new DanError("invalid", "Dish numbers run from 1 to 999."));
    }
    if (this.state.items.some((item) => item.id !== id && item.number === next.number)) {
      return Promise.reject(new DanError("duplicate_number", "That number is already on the menu."));
    }
    if (!next.nameEn) {
      return Promise.reject(new DanError("invalid", "A dish needs a name."));
    }
    if (!Number.isInteger(next.pricePence) || next.pricePence < 0 || next.pricePence > 100_000) {
      return Promise.reject(new DanError("invalid", "Check the price."));
    }
    next.station = (next.station ?? "").trim();
    if (next.station !== current.station && next.station && !this.stations().some((station) => station.id === next.station)) {
      return Promise.reject(new DanError("invalid", "Choose one of the shop's stations."));
    }
    if (!this.state.categories.some((category) => category.id === next.categoryId)) {
      return Promise.reject(new DanError("invalid", "Choose a category."));
    }
    if (next.allergens.some((allergen) => !ALLERGENS.includes(allergen))) {
      return Promise.reject(new DanError("invalid", "Unknown allergen."));
    }

    next.descriptionEn = next.descriptionEn.trim();
    try {
      // Checked against the price as it will be: no way of choosing may take the dish below nothing.
      next.options = checkOptions(next, next.options ?? []);
    } catch (error) {
      return Promise.reject(error);
    }
    this.state.items[index] = next;
    return Promise.resolve(clone(next));
  }

  createMenuItem(input: NewMenuItem): Promise<MenuItem> {
    const [nameEn, nameZh] = bothNames(input.nameEn, input.nameZh);
    const item: MenuItem = {
      id: `item-${crypto.randomUUID().replaceAll("-", "")}`,
      number: input.number,
      categoryId: input.categoryId,
      nameEn,
      nameZh,
      descriptionEn: (input.descriptionEn ?? "").trim(),
      pricePence: input.pricePence,
      station: input.station?.trim() ?? (this.stations().some((station) => station.id === "counter") ? "counter" : ""),
      allergens: [...new Set(input.allergens ?? [])],
      soldOut: false,
      kind: "item",
      includes: [],
    };
    if (!Number.isInteger(item.number) || item.number < 1 || item.number > 999) {
      return Promise.reject(new DanError("invalid", "Dish numbers run from 1 to 999."));
    }
    if (this.state.items.some((other) => other.number === item.number)) {
      return Promise.reject(new DanError("duplicate_number", "That number is already on the menu."));
    }
    if (!item.nameEn) return Promise.reject(new DanError("invalid", "A dish needs a name."));
    if (!Number.isInteger(item.pricePence) || item.pricePence < 0 || item.pricePence > 100_000) {
      return Promise.reject(new DanError("invalid", "Check the price."));
    }
    if ((item.station && !this.stations().some((station) => station.id === item.station)) || item.allergens.some((allergen) => !ALLERGENS.includes(allergen))) {
      return Promise.reject(new DanError("invalid", "Check the station and allergens."));
    }
    if (!this.state.categories.some((category) => category.id === item.categoryId)) {
      return Promise.reject(new DanError("invalid", "Choose a category."));
    }
    try {
      item.options = checkOptions(item, input.options ?? []);
    } catch (error) {
      return Promise.reject(error);
    }
    this.state.items.push(item);
    return Promise.resolve(clone(item));
  }

  deleteMenuItem(id: string): Promise<void> {
    const item = this.state.items.find((entry) => entry.id === id);
    if (!item) return Promise.reject(new DanError("not_found", "That dish is not on the menu."));
    const set = this.state.items.find((other) => other.id !== id && other.includes.some((part) => part.number === item.number));
    if (set) {
      return Promise.reject(
        new DanError("in_a_set", `Dish ${item.number} is part of set meal ${set.number} (${set.nameEn}). Change the set meal first.`),
      );
    }
    this.state.items = this.state.items.filter((entry) => entry.id !== id);
    return Promise.resolve();
  }

  createCategory(names: CategoryNames): Promise<Category> {
    const [nameEn, nameZh] = bothNames(names.nameEn, names.nameZh);
    if (!nameEn) return Promise.reject(new DanError("invalid", "A category needs a name."));
    if (this.state.categories.length >= 40) return Promise.reject(new DanError("invalid", "A menu holds up to 40 categories."));
    const category: Category = {
      id: `cat-${crypto.randomUUID().replaceAll("-", "")}`,
      nameEn,
      nameZh,
      sort: Math.max(0, ...this.state.categories.map((entry) => entry.sort)) + 1,
    };
    this.state.categories.push(category);
    return Promise.resolve(clone(category));
  }

  updateCategory(id: string, names: CategoryNames): Promise<Category> {
    const category = this.state.categories.find((entry) => entry.id === id);
    if (!category) return Promise.reject(new DanError("not_found", "That category is not on the menu."));
    const [nameEn, nameZh] = bothNames(names.nameEn, names.nameZh);
    if (!nameEn) return Promise.reject(new DanError("invalid", "A category needs a name."));
    category.nameEn = nameEn;
    category.nameZh = nameZh;
    return Promise.resolve(clone(category));
  }

  deleteCategory(id: string): Promise<void> {
    if (!this.state.categories.some((entry) => entry.id === id)) {
      return Promise.reject(new DanError("not_found", "That category is not on the menu."));
    }
    const holds = this.state.items.filter((item) => item.categoryId === id).length;
    if (holds > 0) return Promise.reject(new DanError("category_not_empty", `Move or remove its ${holds} dishes first.`));
    this.state.categories = this.state.categories.filter((entry) => entry.id !== id);
    return Promise.resolve();
  }

  reorderCategories(ids: string[]): Promise<Category[]> {
    const known = new Set(this.state.categories.map((entry) => entry.id));
    if (new Set(ids).size !== ids.length || ids.length !== known.size || !ids.every((id) => known.has(id))) {
      return Promise.reject(new DanError("invalid", "List every category once."));
    }
    for (const category of this.state.categories) category.sort = ids.indexOf(category.id) + 1;
    this.state.categories.sort((a, b) => a.sort - b.sort);
    return Promise.resolve(clone(this.state.categories));
  }

  updateShop(patch: ShopPatch): Promise<Shop> {
    const tidy = (value: string) => value.trim().replace(/\s+/g, " ");
    const next: Shop = { ...this.state.shop };
    for (const key of ["name", "nameZh", "address", "city", "phone"] as const) {
      const value = patch[key];
      if (typeof value === "string") next[key] = tidy(value);
    }
    if (!next.name) return Promise.reject(new DanError("invalid", "A shop needs a name."));
    this.state.shop = next;
    return Promise.resolve(clone(next));
  }

  private stations(): Station[] {
    return normalizeStations(this.state.stations, DEFAULT_STATIONS);
  }

  getStations(): Promise<Station[]> {
    return Promise.resolve(clone(this.stations()));
  }

  /** The whole list, in order. A station still on dishes cannot go. */
  updateStations(stations: Station[]): Promise<Station[]> {
    try {
      const next = checkStations(stations);
      checkRemovals(this.stations(), next, this.state.items);
      this.state.stations = next;
      return Promise.resolve(clone(next));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private addons(): Addon[] {
    return normalizeAddons(this.state.addons);
  }

  getAddons(): Promise<Addon[]> {
    return Promise.resolve(clone(this.addons()));
  }

  /** The whole list, in order. Orders already taken keep the add-ons they were placed with. */
  updateAddons(addons: Addon[]): Promise<Addon[]> {
    try {
      const next = checkAddons(addons);
      this.state.addons = next;
      return Promise.resolve(clone(next));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /** The demo's PIN is fixed: there is nothing to sign in to. */
  setCounterPin(pin: string): Promise<void> {
    if (!/^\d{4,6}$/.test(pin)) return Promise.reject(new DanError("invalid", "A PIN is 4 to 6 digits."));
    return Promise.resolve();
  }

  getOrders() {
    const orders = clone(this.state.orders).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return Promise.resolve({ orders });
  }

  getOrderHistory(filter?: OrderHistoryFilter, before?: string | null, limit?: number): Promise<OrderPage> {
    try {
      return Promise.resolve(clone(historyPage(this.state.orders, filter, before, limit)));
    } catch (error) {
      return Promise.reject(error);
    }
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
    // Priced by the one rule, as the shop server does: options, then add-ons on dishes, then on the bill.
    let priced;
    try {
      priced = price(input.lines, input.addons, this.state.items, this.addons(), input.source === "online" ? "online" : "local");
    } catch (error) {
      return Promise.reject(error);
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
      lines: priced.lines,
      totalPence: priced.totalPence,
      addons: priced.addons,
      // Online orders in the demo alternate between the ways the shop takes payment.
      payment: input.source === "online" ? demoPayment(rules, number) : null,
      column: startFor(normalizeBoard(this.state.board), input.source).id,
      columnAt: this.now().toISOString(),
    };
    this.state.orders.unshift(order);
    return Promise.resolve(clone(order));
  }

  /** Only where they can still play: a view that has gone takes its sounds with it. */
  getTriggers(): Promise<Triggers> {
    return Promise.resolve(clone(onlyOn(normalizeTriggers(this.state.triggers), this.views().map((view) => view.id))));
  }

  /** The demo signs in as the owner; the same checks as the shop server. */
  updateTriggers(triggers: Triggers): Promise<Triggers> {
    try {
      const next = checkTriggers(triggers);
      checkPlaces(next, this.views().map((view) => view.id));
      this.state.triggers = next;
      return Promise.resolve(clone(next));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  resetTriggers(): Promise<Triggers> {
    const next = onlyOn(DEFAULT_TRIGGERS, this.views().map((view) => view.id));
    this.state.triggers = clone(next);
    return Promise.resolve(clone(next));
  }

  private views(): View[] {
    return normalizeViews(this.state.views, normalizeBoard(this.state.board));
  }

  getViews(): Promise<View[]> {
    return Promise.resolve(clone(this.views()));
  }

  /** The demo signs in as the owner; the same checks as the shop server. */
  updateViews(views: View[]): Promise<View[]> {
    try {
      const next = checkViews(views, normalizeBoard(this.state.board));
      this.state.views = next;
      return Promise.resolve(clone(next));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /** The demo is a restaurant: back to the kitchen and the pass. */
  resetViews(): Promise<View[]> {
    const next = kitchenAndPass(normalizeBoard(this.state.board));
    this.state.views = next;
    return Promise.resolve(clone(next));
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
      // Saved views keep up with the board; ones never saved are worked out from it each time.
      if (this.state.views) this.state.views = followBoard(this.views(), normalizeBoard(this.state.board), next);
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
    if (this.state.views) this.state.views = followBoard(this.views(), current, DEFAULT_BOARD);
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

  getOrder(id: string): Promise<Order> {
    const order = this.state.orders.find((entry) => entry.id === id);
    return order ? Promise.resolve(clone(order)) : Promise.reject(new DanError("not_found", "That order is not here."));
  }

  getOrderEdits(orderId: string): Promise<OrderEdit[]> {
    return Promise.resolve(clone((this.state.orderEdits ?? []).filter((edit) => edit.orderId === orderId)));
  }

  /** The record is added to, never rewritten: the demo keeps it as the shop server does. */
  private record(order: Order, kind: OrderEdit["kind"], applied: Pick<Applied, "changes" | "lines">, totalAfterPence: number) {
    this.state.orderEdits = [
      ...(this.state.orderEdits ?? []),
      {
        id: `edit-${this.now().getTime().toString(36)}-${(this.state.orderEdits ?? []).length}`,
        orderId: order.id,
        at: this.now().toISOString(),
        byId: this.state.staff.id,
        byName: this.state.staff.name,
        kind,
        changes: applied.changes,
        lines: applied.lines,
        totalBeforePence: order.totalPence,
        totalAfterPence,
      },
    ];
  }

  /** The demo signs in as the owner. The same rules as the shop server's `editOrder`. */
  editOrder(id: string, input: OrderEditInput): Promise<Order> {
    const at = this.state.orders.findIndex((entry) => entry.id === id);
    if (at < 0) return Promise.reject(new DanError("not_found", "That order is not here."));
    try {
      const order = this.state.orders[at];
      const applied = applyEdit(order, input, this.state.items, this.addons(), courierBooked(order));
      if (applied.changes.length === 0 && applied.lines.length === 0) return Promise.resolve(clone(order));
      this.record(order, "edit", applied, applied.order.totalPence);
      this.state.orders[at] = applied.order;
      return Promise.resolve(clone(applied.order));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /** The owner's own move: to any column of the board, back included. */
  moveOrderTo(id: string, to: string): Promise<Order> {
    const order = this.state.orders.find((entry) => entry.id === id);
    if (!order) return Promise.reject(new DanError("not_found", "That order is not here."));
    if (order.status === "cancelled") return Promise.reject(new DanError("order_cancelled", "A cancelled order cannot be changed."));
    const board = normalizeBoard(this.state.board);
    const target = board.columns.find((column) => column.id === to);
    if (!target) return Promise.reject(new DanError("not_found", "That column is not on the board."));
    const here = columnOf(board, order);
    if (here?.id === target.id) return Promise.resolve(clone(order));
    this.record(order, "move", { changes: [{ field: "column", before: here?.nameEn ?? "", after: target.nameEn }], lines: [] }, order.totalPence);
    Object.assign(order, { column: target.id, columnAt: this.now().toISOString(), columnRemap: false, status: statusOf(target.role) });
    return Promise.resolve(clone(order));
  }

  /** The owner's cancel: any order not already cancelled, a completed one included. The demo "refunds" a card at once. */
  cancelOrder(id: string): Promise<Order> {
    const order = this.state.orders.find((entry) => entry.id === id);
    if (!order) return Promise.reject(new DanError("not_found", "That order is not here."));
    if (order.status === "cancelled") return Promise.reject(new DanError("order_cancelled", "That order is already cancelled."));
    const here = columnOf(normalizeBoard(this.state.board), order);
    const plan = cancelPlan(order);
    this.record(
      order,
      "cancel",
      { changes: [{ field: "status", before: here?.nameEn ?? "", after: "Cancelled" }, ...(plan.kind === "card" ? [{ field: "refund", before: "", after: String(plan.pence) }] : [])], lines: [] },
      order.totalPence,
    );
    order.status = "cancelled";
    if (plan.kind === "card") order.refund = "refunded";
    return Promise.resolve(clone(order));
  }

  /** The demo has no Uber account: it can only change a delivery to collection, or cancel an order. */
  courierAction(action: "book" | "cancelCourier" | "toCollection" | "cancelOrder" | "byShop" | "byUber", id: string): Promise<Order> {
    const order = this.state.orders.find((entry) => entry.id === id);
    if (!order) return Promise.reject(new DanError("not_found", "That order is not on the board."));
    if (action === "cancelOrder") return this.cancelOrder(id);
    if (order.status === "completed" || order.status === "cancelled") {
      return Promise.reject(new DanError("order_finished", "That order is finished."));
    }
    if (action === "toCollection" && order.fulfilment === "delivery") {
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
