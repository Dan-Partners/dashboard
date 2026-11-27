"use client";

import { primaryName } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { TicketDetail } from "@/lib/ticket";

/**
 * What was chosen for a dish, under its name: each option, then each add-on
 * on the dish (marked with a plus), in the reader's language.
 */
export function LineDetails({ details, className = "text-sm text-ink-soft" }: { details: TicketDetail[]; className?: string }) {
  const { locale } = useI18n();
  if (details.length === 0) return null;
  return (
    <span className={`block ${className}`} data-testid="line-details">
      {details.map((detail) => `${detail.addon ? "+ " : ""}${primaryName(detail.nameEn, detail.nameZh, locale)}`).join(" · ")}
    </span>
  );
}
