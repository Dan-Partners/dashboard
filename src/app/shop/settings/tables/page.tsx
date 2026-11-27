import type { Metadata } from "next";
import { SettingsFrame } from "@/components/settings-view";
import { TablesSettings } from "@/components/tools-view";

export const metadata: Metadata = { title: "Tables & printers · Settings" };

export default function TablesSettingsPage() {
  return (
    <SettingsFrame section="tables">
      <TablesSettings />
    </SettingsFrame>
  );
}
