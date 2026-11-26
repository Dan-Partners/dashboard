import type { Metadata } from "next";
import { CreateOrder } from "@/components/create-order";

export const metadata: Metadata = { title: "Create order" };

/** Create order: by picking from the menu, or with the till's keypad. */
export default function CreateOrderPage() {
  return <CreateOrder />;
}
