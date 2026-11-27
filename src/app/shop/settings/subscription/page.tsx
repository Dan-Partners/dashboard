import type { Metadata } from "next";
import { SubscriptionView } from "@/components/payments-view";
import { SettingsFrame } from "@/components/settings-view";

export const metadata: Metadata = { title: "Subscription · Settings" };

export default function SubscriptionSettingsPage() {
  return (
    <SettingsFrame section="subscription">
      <SubscriptionView />
    </SettingsFrame>
  );
}
