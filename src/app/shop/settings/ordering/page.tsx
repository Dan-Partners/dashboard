import type { Metadata } from "next";
import { OrderingView } from "@/components/ordering-view";
import { SettingsFrame } from "@/components/settings-view";

export const metadata: Metadata = { title: "Ordering · Settings" };

export default function OrderingSettingsPage() {
  return (
    <SettingsFrame section="ordering">
      <OrderingView />
    </SettingsFrame>
  );
}
