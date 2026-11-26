"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import { writePersisted } from "@/lib/storage";
import { MakeView } from "./kitchen-view";
import { HandOverView } from "./pass-view";
import { PageTitle } from "./ui";

/**
 * One of the owner's views of the order flow, in its look. A view that has
 * gone (the owner removed it) says so; a tablet locked to it is unlocked.
 */
export function ViewScreen({ id }: { id: string }) {
  const { t } = useI18n();
  const shop = useShop();
  const views = shop.snapshot?.views;
  const view = views?.find((entry) => entry.id === id);
  const focus = shop.persisted.focus;
  const lockedToGone = Boolean(views) && !view && focus?.position === "view" && focus.view === id;

  useEffect(() => {
    if (lockedToGone) writePersisted({ focus: null });
  }, [lockedToGone]);

  if (!views) return null;
  if (!view) {
    return (
      <div data-testid="view-gone">
        <PageTitle title={t("viewGoneTitle")} />
        <p className="text-ink-soft">{t("viewGoneLede")}</p>
        <p className="mt-4">
          <Link href="/shop/orders" className="inline-flex min-h-11 items-center font-display text-accent-ink underline">
            {t("navOrders")}
          </Link>
        </p>
      </div>
    );
  }
  return view.look === "hand_over" ? <HandOverView view={view} /> : <MakeView view={view} />;
}
