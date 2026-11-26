import type { Metadata } from "next";
import { JoinScreen } from "@/components/join-screen";

export const metadata: Metadata = {
  title: "Set up your shop",
  // An invite link is for one person.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function JoinPage() {
  return (
    <main id="main">
      <JoinScreen />
    </main>
  );
}
