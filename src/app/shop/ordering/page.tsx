import type { Metadata } from "next";
import { OrderingView } from "@/components/ordering-view";

export const metadata: Metadata = { title: "Ordering & payments" };

export default function OrderingPage() {
  return <OrderingView />;
}
