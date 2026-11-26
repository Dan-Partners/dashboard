"use client";

import { useMemo } from "react";
import { shownColour } from "./board";
import { useShop } from "./shop-context";
import { resolveTheme, specOf } from "./theme";

/** A column colour as it shows on this shop's theme (strengthened if it would be hard to see). */
export function useBoardColour(): (colour: string) => string {
  const shop = useShop();
  const paper = useMemo(() => resolveTheme(specOf(shop.persisted.theme)).page.paper, [shop.persisted.theme]);
  return (colour: string) => shownColour(colour, paper).colour;
}

/** The theme's background, for saying which colours were strengthened. */
export function useBoardPaper(): string {
  const shop = useShop();
  return useMemo(() => resolveTheme(specOf(shop.persisted.theme)).page.paper, [shop.persisted.theme]);
}
