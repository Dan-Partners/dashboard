import type { Metadata } from "next";
import { SalesView } from "@/components/sales-view";

export const metadata: Metadata = { title: "Sales" };

export default function SalesPage() {
  return <SalesView />;
}