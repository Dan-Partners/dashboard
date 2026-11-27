import type { Metadata } from "next";
import { SettingsFrame } from "@/components/settings-view";
import { ActivityView } from "@/components/staff-section";

export const metadata: Metadata = { title: "Activity · Settings" };

export default function ActivityPage() {
  return (
    <SettingsFrame section="staff" sub={{ label: "activityTitle", gloss: "activityTitleZh" }}>
      <ActivityView />
    </SettingsFrame>
  );
}
