import type { Category, MenuItem } from "./types";
import type { View } from "./views";

/**
 * A shop has a kitchen when one of its views is a "make" view. Then an order
 * is "sent to the kitchen"; a shop without one "places" it.
 */
export function hasKitchen(views: Pick<View, "look">[]): boolean {
  return views.some((view) => view.look === "make");
}

/**
 * The dishes the menu picker shows. A search (part of a name in either
 * language, or a dish number) looks through the whole menu; otherwise the
 * chosen category, or everything. In the menu's own order: by category,
 * then by number.
 */
export function dishesFor(items: MenuItem[], categories: Category[], categoryId: string | null, search: string): MenuItem[] {
  const order = new Map(categories.map((category, index) => [category.id, index]));
  const sorted = [...items].sort((a, b) => (order.get(a.categoryId) ?? 999) - (order.get(b.categoryId) ?? 999) || a.number - b.number);
  const text = search.trim().toLowerCase();
  if (text) {
    if (/^\d+$/.test(text)) {
      // The dish with that number first, then numbers that start with it.
      return sorted.filter((item) => String(item.number).startsWith(text)).sort((a, b) => Number(String(b.number) === text) - Number(String(a.number) === text));
    }
    return sorted.filter((item) => item.nameEn.toLowerCase().includes(text) || item.nameZh.toLowerCase().includes(text));
  }
  return categoryId ? sorted.filter((item) => item.categoryId === categoryId) : sorted;
}
