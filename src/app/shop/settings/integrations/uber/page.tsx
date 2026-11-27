import type { Metadata } from "next";
import { SettingsFrame } from "@/components/settings-view";
import { UberIntegration } from "@/components/uber-section";

export const metadata: Metadata = { title: "Uber Direct · Integrations" };

export default function UberPage() {
  return (
    <SettingsFrame section="integrations" sub={{ label: "uberName", gloss: "uberWhat" }}>
      <UberIntegration />
    </SettingsFrame>
  );
}
