import type { Metadata } from "next";
import { OrdersBoard } from "@/components/orders-board";

export const metadata: Metadata = { title: "Orders" };

export default function OrdersPage() {
  return <OrdersBoard />;
}
