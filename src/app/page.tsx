import type { Metadata } from "next";
import { ConnectScreen } from "@/components/connect-screen";

export const metadata: Metadata = {
  title: "Connect",
};

export default function HomePage() {
  return (
    <main id="main">
      <ConnectScreen />
    </main>
  );
}
