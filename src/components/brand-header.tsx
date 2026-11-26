"use client";

import { useI18n } from "@/lib/i18n";
import { DanMark } from "./mark";

/** The mark, the wordmark and the name set as its dictionary entry: the top of every signed-out page. */
export function BrandHeader() {
  const { t } = useI18n();
  return (
    <>
      <div className="flex items-end gap-4">
        <DanMark size={76} title="Dan" />
        <div className="min-w-0 pb-1">
          <p className="font-zh text-sm tracking-[0.42em] text-accent-ink">{t("appPun")}</p>
          <p className="font-wordmark text-6xl leading-none">Dan</p>
        </div>
      </div>
      <p className="mt-4 border-t-[3px] border-ink pt-3 text-ink-soft">
        <span className="font-zh text-xl text-ink">單</span>
        <span className="ml-2 italic">
          daan<sup>1</sup>
        </span>
        <span className="mx-2" aria-hidden>
          ·
        </span>
        <span className="italic">{t("dictPart")}</span>
        <span className="mx-2" aria-hidden>
          ·
        </span>
        {t("dictSense")}
      </p>
    </>
  );
}

/** The page frame signed-out pages share: one narrow column, centred. */
export function SignedOutPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-0.375rem)] w-full max-w-md flex-col justify-center px-5 py-12">
      <BrandHeader />
      {children}
    </div>
  );
}
