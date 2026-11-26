import type { Metadata } from "next";
import { BoardView } from "@/components/board-view";
import { SoundsSection } from "@/components/sounds-section";

export const metadata: Metadata = { title: "Board & sounds" };

export default function BoardPage() {
  return (
    <BoardView>
      <SoundsSection />
    </BoardView>
  );
}
