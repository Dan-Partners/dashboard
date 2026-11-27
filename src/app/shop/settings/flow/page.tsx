import type { Metadata } from "next";
import { BoardView } from "@/components/board-view";
import { SettingsFrame } from "@/components/settings-view";
import { SoundsSection } from "@/components/sounds-section";
import { StationsSection } from "@/components/stations-section";
import { ViewsSection } from "@/components/views-section";

export const metadata: Metadata = { title: "Order flow · Settings" };

export default function FlowSettingsPage() {
  return (
    <SettingsFrame section="flow">
      <BoardView>
        <ViewsSection />
        <SoundsSection />
        <StationsSection />
      </BoardView>
    </SettingsFrame>
  );
}
