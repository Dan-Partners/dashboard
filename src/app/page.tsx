import type { Metadata } from "next";
import { SignInScreen } from "@/components/sign-in-screen";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function HomePage() {
  return (
    <main id="main">
      <SignInScreen />
    </main>
  );
}
