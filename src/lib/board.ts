import { DanError } from "./errors";
import { CONTRAST, ensureContrast } from "./theme";
import type { Order, OrderSource, OrderStatus } from "./types";

/**
 * The orders board: the owner's columns, left to right. The shop server
 * holds it and enforces its rules; this mirrors them for the demo and so
 * the screen can say what is wrong before saving.
 *
 * An order's status is the role of the furthest column it has reached; its
 * `column` is where it sits. One without a column sits in the first column
 * for its status.
 */
export type ColumnRole = "incoming" | "in_progress" | "ready" | "completed";

export type BoardColumn = {
  /** Stable: triggers and tickets point at it, so renaming changes nothing. */
  id: string;
  nameEn: string;
  nameZh: string;
  role: ColumnRole;
  /** The ticket's border on screen. */
  colour: string;
};

export type Board = { columns: BoardColumn[] };

/** What saving a board would do to the tickets on it now. */
export type BoardPreview = {
  moves: { fromColumn: string; toColumn: string; tickets: number }[];
  /** Tickets that would have to go back a step: the save is refused. */
  stuckTickets: number;
};

export const MAX_COLUMNS = 8;
export const ROLES: ColumnRole[] = ["incoming", "in_progress", "ready", "completed"];

export const DEFAULT_BOARD: Board = {
  columns: [
    { id: "new", nameEn: "New", nameZh: "新單", role: "incoming", colour: "#1f9d55" },
    { id: "preparing", nameEn: "Preparing", nameZh: "製作中", role: "in_progress", colour: "#2f6fdb" },
    { id: "ready", nameEn: "Ready", nameZh: "可取", role: "ready", colour: "#d7372a" },
    { id: "completed", nameEn: "Completed", nameZh: "完成", role: "completed", colour: "#8a8a8a" },
  ],
};

const RANK: Record<ColumnRole, number> = { incoming: 0, in_progress: 1, ready: 2, completed: 3 };

export function roleOf(status: OrderStatus): ColumnRole | null {
  switch (status) {
    case "new":
      return "incoming";
    case "preparing":
      return "in_progress";
    case "ready":
      return "ready";
    case "completed":
      return "completed";
    default:
      return null;
  }
}

export function statusOf(role: ColumnRole): OrderStatus {
  return role === "incoming" ? "new" : role === "in_progress" ? "preparing" : role;
}

/** The furthest of two statuses along the board. */
function furthest(a: OrderStatus, b: OrderStatus): OrderStatus {
  const ra = roleOf(a);
  const rb = roleOf(b);
  if (!ra || !rb) return a === "cancelled" ? a : b;
  return RANK[ra] >= RANK[rb] ? a : b;
}

/** Where an order sits (the server's rule): its own column unless it has gone further, else the first for its status. */
export function columnOf(board: Board, order: Pick<Order, "status" | "column">): BoardColumn | null {
  const role = roleOf(order.status);
  if (!role) return null;
  const own = order.column ? board.columns.find((column) => column.id === order.column) : undefined;
  if (own && RANK[own.role] >= RANK[role]) return own;
  return board.columns.find((column) => column.role === role) ?? [...board.columns].reverse().find((column) => RANK[column.role] < RANK[role]) ?? null;
}

export function startFor(board: Board, source: OrderSource): BoardColumn {
  const incoming = board.columns.find((column) => column.role === "incoming") ?? board.columns[0];
  if (source === "online") return incoming;
  return board.columns.find((column) => column.role === "in_progress") ?? incoming;
}

export function nextAfter(board: Board, id: string): BoardColumn | null {
  const at = board.columns.findIndex((column) => column.id === id);
  return at >= 0 ? (board.columns[at + 1] ?? null) : null;
}

/** The status an order has after moving into `column`. */
export function statusAfter(order: Pick<Order, "status">, column: BoardColumn): OrderStatus {
  return furthest(statusOf(column.role), order.status);
}

/** A column's heading: one language filled in is the heading in both. */
export function columnName(column: BoardColumn, locale: string): string {
  const en = column.nameEn.trim();
  const zh = column.nameZh.trim();
  return locale === "zh-Hant" ? zh || en : en || zh;
}

/** The other language's name, for the small gloss, when both are set. */
export function columnGloss(column: BoardColumn, locale: string): string {
  const en = column.nameEn.trim();
  const zh = column.nameZh.trim();
  if (!en || !zh) return "";
  return locale === "zh-Hant" ? en : zh;
}

/** A new column's id. */
export function newColumnId(): string {
  const letters = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "col-";
  for (let i = 0; i < 6; i++) id += letters[Math.floor(Math.random() * letters.length)];
  return id;
}

/** The server's checks on a board, with its codes. Returns it tidied. */
export function checkBoard(board: Board): Board {
  const count = board.columns.length;
  if (count < 2 || count > MAX_COLUMNS) throw new DanError("board_size", `A board has 2 to ${MAX_COLUMNS} columns.`);
  const seen = new Set<string>();
  const columns = board.columns.map((column) => {
    const id = column.id.trim();
    if (!/^[a-z0-9_-]{1,32}$/.test(id) || seen.has(id)) throw new DanError("board_ids", "Each column needs its own id.");
    seen.add(id);
    const tidy = (name: string) => name.trim().split(/\s+/).filter(Boolean).join(" ");
    const nameEn = tidy(column.nameEn);
    const nameZh = tidy(column.nameZh);
    if ((!nameEn && !nameZh) || [...nameEn].length > 24 || [...nameZh].length > 24) {
      throw new DanError("board_name", "Give each column a name, up to 24 characters.");
    }
    const colour = column.colour.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(colour)) throw new DanError("board_colour", "Pick a colour for each column.");
    return { id, nameEn, nameZh, role: column.role, colour };
  });
  const roles = columns.map((column) => column.role);
  const howMany = (role: ColumnRole) => roles.filter((r) => r === role).length;
  const flows = roles.every((role, i) => i === 0 || RANK[roles[i - 1]] <= RANK[role]);
  if (howMany("incoming") !== 1 || howMany("completed") !== 1 || howMany("ready") === 0 || !flows) {
    throw new DanError("board_roles", "The board runs New first, then any in-progress columns, at least one ready column, and Completed last.");
  }
  return { columns };
}

/** Reads a saved board leniently: anything broken is the default. */
export function normalizeBoard(value: unknown): Board {
  try {
    const board = value as Board;
    if (!board || !Array.isArray(board.columns)) return DEFAULT_BOARD;
    return checkBoard(board);
  } catch {
    return DEFAULT_BOARD;
  }
}

export type PlannedMove = { orderId: string; from: string; to: string };

/**
 * For each open ticket in a removed column: the nearest remaining column to
 * its left with the same role (never back a step), else the first of its
 * role. Those with nowhere to go are counted as stuck. The server's rule.
 */
export function planMoves(old: Board, next: Board, orders: Order[]): { moves: PlannedMove[]; stuck: number } {
  const moves: PlannedMove[] = [];
  let stuck = 0;
  for (const order of orders) {
    if (!["new", "preparing", "ready"].includes(order.status) || order.number <= 0) continue;
    const at = columnOf(old, order);
    const role = roleOf(order.status);
    if (!at || !role || next.columns.some((column) => column.id === at.id)) continue;
    const position = old.columns.findIndex((column) => column.id === at.id);
    const left = old.columns
      .slice(0, position)
      .reverse()
      .filter((column) => column.role === role)
      .map((column) => next.columns.find((kept) => kept.id === column.id))
      .find(Boolean);
    const target = left ?? next.columns.find((column) => column.role === role);
    if (target) moves.push({ orderId: order.id, from: at.id, to: target.id });
    else stuck++;
  }
  return { moves, stuck };
}

export function summarise(moves: PlannedMove[]): BoardPreview["moves"] {
  const counts = new Map<string, number>();
  for (const move of moves) counts.set(`${move.from}\u0000${move.to}`, (counts.get(`${move.from}\u0000${move.to}`) ?? 0) + 1);
  return [...counts.entries()].map(([key, tickets]) => {
    const [fromColumn, toColumn] = key.split("\u0000");
    return { fromColumn, toColumn, tickets };
  });
}

/**
 * The next step for a ticket: the column it moves to and what the button
 * says. Accept from incoming; Mark ready into a ready column (from the
 * kitchen side); Collected, Delivered or Served into completed; otherwise
 * Move to the column's name.
 */
export type NextStep = { column: BoardColumn; kind: "accept" | "ready" | "done" | "move" };

export function nextStep(board: Board, order: Order): NextStep | null {
  const here = columnOf(board, order);
  if (!here || order.status === "completed" || order.status === "cancelled") return null;
  const next = nextAfter(board, here.id);
  if (!next) return null;
  if (here.role === "incoming") return { column: next, kind: "accept" };
  if (next.role === "completed") return { column: next, kind: "done" };
  if (next.role === "ready" && here.role !== "ready") return { column: next, kind: "ready" };
  return { column: next, kind: "move" };
}

/** The column a ticket may be sent back to: the one before, when it is the same stage. */
export function backStep(board: Board, order: Order): BoardColumn | null {
  const here = columnOf(board, order);
  if (!here || order.status === "completed" || order.status === "cancelled") return null;
  const at = board.columns.findIndex((column) => column.id === here.id);
  const before = at > 0 ? board.columns[at - 1] : null;
  return before && before.role === here.role ? before : null;
}

/**
 * A column's colour as it shows on screen: the owner's choice, strengthened
 * when it would be hard to see on the shop's theme (as the theme does with
 * its own accent). Printed tickets never use it.
 */
export function shownColour(colour: string, paper: string): { colour: string; strengthened: boolean } {
  const shown = ensureContrast(colour, paper, CONTRAST.fill);
  return { colour: shown, strengthened: shown.toLowerCase() !== colour.toLowerCase() };
}
