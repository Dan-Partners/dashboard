import type { Metadata } from "next";
import { Suspense } from "react";
import { TicketView } from "@/components/ticket-view";
import { Splash } from "@/components/ui";

export const metadata: Metadata = { title: "Ticket" };

export default function TicketPage() {
  return (
    <Suspense fallback={<Splash />}>
      <TicketView />
    </Suspense>
  );
}
