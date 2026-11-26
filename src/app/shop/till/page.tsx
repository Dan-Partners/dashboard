import type { Metadata } from "next";
import { TillRedirect } from "@/components/till-redirect";

export const metadata: Metadata = { title: "Till" };

/** The till is create order now, in till mode. Old links and bookmarks still arrive. */
export default function TillPage() {
  return <TillRedirect />;
}
