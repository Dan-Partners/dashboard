import type { Metadata } from "next";
import { KitchenView } from "@/components/kitchen-view";

export const metadata: Metadata = { title: "Kitchen" };

export default function KitchenPage() {
  return <KitchenView />;
}
