import type { Metadata } from "next";
import { SettingsFrame, ShopSettings } from "@/components/settings-view";

export const metadata: Metadata = { title: "Shop · Settings" };

export default function ShopSettingsPage() {
  return (
    <SettingsFrame section="shop">
      <ShopSettings />
    </SettingsFrame>
  );
}
