import type { Metadata } from "next";
import { LoyaltyBook } from "@/components/loyalty-book";

export const metadata: Metadata = { title: "Stamps" };

export default function LoyaltyPage() {
  return <LoyaltyBook />;
}
