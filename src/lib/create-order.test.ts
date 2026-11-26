import { describe, expect, it } from "vitest";
import { dishesFor, hasKitchen } from "./create-order";
import type { Category, MenuItem } from "./types";

const categories: Category[] = [
  { id: "starters", nameEn: "Starters", nameZh: "小食", sort: 0 },
  { id: "rice", nameEn: "Rice", nameZh: "飯", sort: 1 },
];
const dish = (number: number, categoryId: string, nameEn: string, nameZh = nameEn): MenuItem => ({
  id: `item-${number}`,
  number,
  categoryId,
  nameEn,
  nameZh,
  descriptionEn: "",
  pricePence: 100,
  station: "",
  allergens: [],
  soldOut: false,
  kind: "item",
  includes: [],
});
const items = [dish(81, "rice", "Egg fried rice", "蛋炒飯"), dish(8, "starters", "Prawn toast", "蝦多士"), dish(1, "starters", "Spring rolls", "春卷"), dish(80, "rice", "Boiled rice", "白飯")];
const numbers = (list: MenuItem[]) => list.map((item) => item.number);

describe("the menu picker", () => {
  it("shows the menu in its own order: by category, then by number", () => {
    expect(numbers(dishesFor(items, categories, null, ""))).toEqual([1, 8, 80, 81]);
    expect(numbers(dishesFor(items, categories, "rice", ""))).toEqual([80, 81]);
  });

  it("searches the whole menu by name in either language, or by number", () => {
    expect(numbers(dishesFor(items, categories, "starters", "RICE"))).toEqual([80, 81]);
    expect(numbers(dishesFor(items, categories, null, "春"))).toEqual([1]);
    // The dish with exactly that number first, then numbers that start with it.
    expect(numbers(dishesFor(items, categories, null, "8"))).toEqual([8, 80, 81]);
    expect(numbers(dishesFor(items, categories, null, "81"))).toEqual([81]);
    expect(dishesFor(items, categories, null, "pizza")).toEqual([]);
  });
});

describe("a shop with no kitchen places an order", () => {
  it("has a kitchen when one of its views is a make view", () => {
    expect(hasKitchen([{ look: "make" }, { look: "hand_over" }])).toBe(true);
    expect(hasKitchen([{ look: "hand_over" }])).toBe(false);
    expect(hasKitchen([])).toBe(false);
  });
});
