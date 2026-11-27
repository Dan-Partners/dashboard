import type { Metadata } from "next";
import { StripeIntegration } from "@/components/payments-view";
import { SettingsFrame } from "@/components/settings-view";

export const metadata: Metadata = { title: "Stripe · Integrations" };

export default function StripePage() {
  return (
    <SettingsFrame section="integrations" sub={{ label: "stripeName", gloss: "stripeWhat" }}>
      <StripeIntegration />
    </SettingsFrame>
  );
}
