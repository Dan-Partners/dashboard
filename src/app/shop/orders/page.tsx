import type { Metadata } from "next";
import { OrdersScreen } from "@/components/orders-board";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersPage() {
  return <OrdersScreen />;
}
