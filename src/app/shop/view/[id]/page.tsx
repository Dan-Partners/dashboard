import type { Metadata } from "next";
import { Suspense } from "react";
import { ViewScreen } from "@/components/view-screen";

export const metadata: Metadata = { title: "View" };

/**
 * One of the owner's views: /shop/view/kitchen, /shop/view/pass, and any they
 * add. Not async: the id is read inside the boundary, so the page's frame is
 * ready at once (see the Next.js caching guide). Ids are plain (a-z, 0-9, -
 * and _); anything else is simply a view that is not there.
 */
export default function ViewPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={null}>{params.then(({ id }) => <ViewScreen id={id} />)}</Suspense>;
}
