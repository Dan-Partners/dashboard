import type { Board } from "./board";
import { DanError } from "./errors";

/**
 * A view: the owner's way of looking at one part of the order flow. It has a
 * name, the board columns it shows, and a look. A tablet can be locked to a
 * view, and sounds play on views. The orders board is not a view: it always
 * shows every column.
 */
export type ViewLook = "make" | "hand_over";
export const VIEW_LOOKS: ViewLook[] = ["make", "hand_over"];

export type View = {
  /** Stable: sounds and locked tablets point at it. */
  id: string;
  nameEn: string;
  nameZh: string;
  /** make: what to make, large, by station. hand_over: who it is for, large. */
  look: ViewLook;
  /** The board columns it shows, by id, in the board's order. */
  columns: string[];
};

export const MAX_VIEWS = 12;
export const MAX_VIEW_NAME = 24;
/** Ids a view cannot have: other places a tablet can be, or a sound can play. */
export const RESERVED_VIEW_IDS = ["counter", "board", "till", "orders"];

export const VIEW_FIELDS = "id nameEn nameZh look columns";

/** Where a view's screen lives. */
export const viewRoute = (id: string) => `/shop/view/${encodeURIComponent(id)}`;

/** Kitchen and Pass, on this board: what a restaurant starts with. */
export function kitchenAndPass(board: Board): View[] {
  const withRoles = (roles: string[]) => board.columns.filter((column) => roles.includes(column.role)).map((column) => column.id);
  return [
    { id: "kitchen", nameEn: "Kitchen", nameZh: "廚房", look: "make", columns: withRoles(["incoming", "in_progress", "ready"]) },
    { id: "pass", nameEn: "Pass", nameZh: "出餐", look: "hand_over", columns: withRoles(["ready"]) },
  ];
}

export function viewName(view: Pick<View, "nameEn" | "nameZh">, locale: string): string {
  return (locale === "zh-Hant" ? view.nameZh : view.nameEn) || view.nameEn || view.nameZh;
}

/** Its name in the other language. Empty when it has one name. */
export function viewGloss(view: Pick<View, "nameEn" | "nameZh">, locale: string): string {
  if (view.nameEn === view.nameZh || !view.nameEn || !view.nameZh) return "";
  return locale === "zh-Hant" ? view.nameEn : view.nameZh;
}

/** A new view's id, from its name, and not one already used or kept back. */
export function newViewId(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24)
      .replace(/-+$/g, "") || "view";
  const used = [...taken, ...RESERVED_VIEW_IDS];
  if (!used.includes(base)) return base;
  for (let n = 2; n < 100; n += 1) if (!used.includes(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now().toString(36)}`;
}

/** The server's checks, with its codes. Returns the list tidied. */
export function checkViews(list: View[], board: Board): View[] {
  if (list.length > MAX_VIEWS) throw new DanError("views_size", `Up to ${MAX_VIEWS} views.`);
  const seen = new Set<string>();
  return list.map((view) => {
    const id = view.id.trim();
    if (!/^[a-z0-9_-]{1,32}$/.test(id) || RESERVED_VIEW_IDS.includes(id) || seen.has(id)) throw new DanError("views_ids", "Each view needs its own id.");
    seen.add(id);
    const en = view.nameEn.trim();
    const zh = view.nameZh.trim();
    if (!en && !zh) throw new DanError("views_name", "Each view needs a name.");
    const nameEn = en || zh;
    const nameZh = zh || en;
    if ([...nameEn].length > MAX_VIEW_NAME || [...nameZh].length > MAX_VIEW_NAME) {
      throw new DanError("views_name", `A view's name is up to ${MAX_VIEW_NAME} characters.`);
    }
    if (!VIEW_LOOKS.includes(view.look)) throw new DanError("views_look", "Choose how the view looks.");
    if (view.columns.some((column) => !board.columns.some((known) => known.id === column))) {
      throw new DanError("views_columns", "A view shows columns from the board. The board may have changed: reload and choose again.");
    }
    // In the board's order, each once.
    const columns = board.columns.filter((column) => view.columns.includes(column.id)).map((column) => column.id);
    return { id, nameEn, nameZh, look: view.look, columns };
  });
}

/** Saved views that cannot be read are treated as not there. */
export function normalizeViews(value: unknown, board: Board): View[] {
  if (!Array.isArray(value)) return kitchenAndPass(board);
  try {
    // Columns the board no longer has are dropped, as the server does when it reads.
    return checkViews(
      (value as View[]).map((view) => ({ ...view, columns: (view.columns ?? []).filter((column) => board.columns.some((known) => known.id === column)) })),
      board,
    );
  } catch {
    return kitchenAndPass(board);
  }
}

/**
 * The same views after the board changed: columns that went leave every view,
 * and a new column joins each view that showed every column of its stage.
 */
export function followBoard(views: View[], old: Board, next: Board): View[] {
  const added = next.columns.filter((column) => !old.columns.some((known) => known.id === column.id));
  return views.map((view) => {
    const shown = view.columns.filter((id) => next.columns.some((column) => column.id === id));
    for (const column of added) {
      const stage = old.columns.filter((other) => other.role === column.role);
      if (stage.length > 0 && stage.every((other) => view.columns.includes(other.id))) shown.push(column.id);
    }
    return { ...view, columns: next.columns.filter((column) => shown.includes(column.id)).map((column) => column.id) };
  });
}
