import type { Metadata } from "next";
import { NewPasswordScreen } from "@/components/new-password-screen";

export const metadata: Metadata = {
  title: "New password",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ResetPage() {
  return (
    <main id="main">
      <NewPasswordScreen />
    </main>
  );
}
