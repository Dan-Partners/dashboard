import type { Metadata } from "next";
import { SettingsIndex } from "@/components/settings-view";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <SettingsIndex />;
}
