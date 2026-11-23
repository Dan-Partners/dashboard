import type { Metadata } from "next";
import { Till } from "@/components/till";

export const metadata: Metadata = { title: "Till" };

export default function TillPage() {
  return <Till />;
}
