import type { Metadata } from "next";
import { ViewScreen } from "@/components/view-screen";

export const metadata: Metadata = { title: "View" };

/** One of the owner's views: /shop/view/kitchen, /shop/view/pass, and any they add. */
export default async function ViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Ids are plain (a-z, 0-9, - and _); anything else is simply a view that is not there.
  return <ViewScreen id={id} />;
}
