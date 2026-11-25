import type { Metadata } from "next";
import { PassView } from "@/components/pass-view";

export const metadata: Metadata = { title: "Pass" };

export default function PassPage() {
  return <PassView />;
}
