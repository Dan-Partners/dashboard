import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoyaltyBook } from "@/components/loyalty-book";
import { FEATURES } from "@/lib/features";

export const metadata: Metadata = { title: "Stamps" };

export default function LoyaltyPage() {
  // Switched off for now: see FEATURES.
  if (!FEATURES.stamps) redirect("/shop/orders");
  return <LoyaltyBook />;
}
