"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";

/**
 * A strip under the header while the counter is on the cloud, and a short
 * "back on the shop server" once it returns.
 */
export function ServerSwitchNotice() {
  const { t } = useI18n();
  const { servers } = useShop();
  const [lastInUse, setLastInUse] = useState(servers.inUse);
  const [back, setBack] = useState(false);

  // Noticed while rendering, so the strip changes in the same paint as the corner.
  if (lastInUse !== servers.inUse) {
    setLastInUse(servers.inUse);
    setBack(lastInUse === "cloud" && servers.inUse === "shop" && servers.shop === "connected");
  }

  useEffect(() => {
    if (!back) return;
    const timer = window.setTimeout(() => setBack(false), 8000);
    return () => window.clearTimeout(timer);
  }, [back]);

  if (servers.inUse === "cloud") {
    return (
      <div
        className="no-print border-b border-rule border-l-[6px] border-l-accent bg-paper-raised px-4 py-3 font-display md:px-8"
        role="status"
        data-testid="server-switch"
        data-server="cloud"
      >
        {t("serverOnCloud")}
      </div>
    );
  }
  if (back) {
    return (
      <div className="no-print border-b border-rule px-4 py-3 md:px-8" role="status" data-testid="server-switch" data-server="shop">
        {t("serverBackOnShop")}
      </div>
    );
  }
  return null;
}
