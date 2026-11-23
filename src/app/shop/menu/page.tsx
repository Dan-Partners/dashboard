import type { Metadata } from "next";
import { MenuBoard } from "@/components/menu-board";

export const metadata: Metadata = { title: "Menu" };

export default function MenuPage() {
  return <MenuBoard />;
}
