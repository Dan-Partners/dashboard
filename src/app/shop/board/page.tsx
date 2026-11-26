import type { Metadata } from "next";
import { BoardView } from "@/components/board-view";
import { SoundsSection } from "@/components/sounds-section";
import { StationsSection } from "@/components/stations-section";

export const metadata: Metadata = { title: "Order board" };

export default function BoardPage() {
  return (
    <BoardView>
      <SoundsSection />
      <StationsSection />
    </BoardView>
  );
}
