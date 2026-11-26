import type { Metadata } from "next";
import { ConnectScreen } from "@/components/connect-screen";

export const metadata: Metadata = {
  title: "Connect",
};

/** For a shop with its own server: connect to it by its address. */
export default function ConnectPage() {
  return (
    <main id="main">
      <ConnectScreen />
    </main>
  );
}
