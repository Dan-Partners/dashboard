import type { Metadata } from "next";
import { SettingsFrame } from "@/components/settings-view";
import { StaffSettings } from "@/components/staff-section";

export const metadata: Metadata = { title: "Staff · Settings" };

export default function StaffSettingsPage() {
  return (
    <SettingsFrame section="staff">
      <StaffSettings />
    </SettingsFrame>
  );
}
