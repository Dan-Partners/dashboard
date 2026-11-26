import type { Metadata } from "next";
import { BoardView } from "@/components/board-view";

export const metadata: Metadata = { title: "Board & sounds" };

export default function BoardPage() {
  return <BoardView />;
}
