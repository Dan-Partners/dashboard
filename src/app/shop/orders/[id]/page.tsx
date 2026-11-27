import type { Metadata } from "next";
import { Suspense } from "react";
import { OrderScreen } from "@/components/order-screen";

export const metadata: Metadata = { title: "Order" };

/**
 * One order: its docket, and for the owner its editor and the record of
 * changes. Not async: the id is read inside the boundary, so the page's
 * frame is ready at once (see the Next.js caching guide).
 */
export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={null}>{params.then(({ id }) => <OrderScreen id={id} />)}</Suspense>;
}
