import type { Metadata } from "next";
import { IntegrationsList, SettingsFrame } from "@/components/settings-view";

export const metadata: Metadata = { title: "Integrations · Settings" };

export default function IntegrationsPage() {
  return (
    <SettingsFrame section="integrations">
      <IntegrationsList />
    </SettingsFrame>
  );
}
