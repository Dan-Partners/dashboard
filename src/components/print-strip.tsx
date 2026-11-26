"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";

/**
 * On every tablet, while a printer is not answering or tickets were given
 * up on: which printer, how many tickets, and Retry now.
 */
export function PrintStrip() {
  const { t } = useI18n();
  const shop = useShop();
  const [busy, setBusy] = useState(false);
  const troubled = shop.servers.printers.filter((printer) => (printer.failing && printer.waiting > 0) || printer.failed > 0);
  if (troubled.length === 0) return null;
  const anyFailed = troubled.some((printer) => printer.failed > 0);
  const tickets = (n: number) => `${n} ${t(n === 1 ? "printStripTicket" : "printStripTickets")}`;
  const act = (work: Parameters<typeof shop.onServer>[0]) => {
    setBusy(true);
    void shop
      .onServer(work)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };
  return (
    <div
      className="no-print flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule border-l-[6px] border-l-[#d7372a] bg-paper-raised px-4 py-3 md:px-8"
      role="alert"
      data-testid="print-strip"
    >
      <ul className="min-w-0 font-display">
        {troubled.map((printer) => (
          <li key={printer.printerId}>
            {printer.waiting > 0 ? (
              <span>
                {printer.name} · {t("printStripFailing")} · {tickets(printer.waiting)} {t("printStripWaiting")}
              </span>
            ) : null}
            {printer.failed > 0 ? (
              <span className={printer.waiting > 0 ? "block" : ""}>
                {printer.name} · {tickets(printer.failed)} {t("printStripFailed")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          disabled={busy}
          className="min-h-11 cursor-pointer bg-ink px-4 font-display text-paper active:bg-ink/80 disabled:opacity-40"
          onClick={() => act((client) => client.retryPrinting())}
        >
          {t("printRetry")}
        </button>
        {anyFailed ? (
          <button
            type="button"
            disabled={busy}
            className="min-h-11 cursor-pointer border border-rule px-4 font-display active:bg-paper-deep disabled:opacity-40"
            onClick={() => act((client) => client.dismissPrintFailures())}
          >
            {t("printDismiss")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Prints an order again on the shop's printers. Shown only when the shop has printers. */
export function ReprintButton({ orderId, className = "" }: { orderId: string; className?: string }) {
  const { t } = useI18n();
  const shop = useShop();
  const [state, setState] = useState<"idle" | "busy" | "sent" | string>("idle");
  if (shop.servers.printers.length === 0) return null;
  return (
    <button
      type="button"
      disabled={state === "busy"}
      className={`min-h-11 cursor-pointer border border-rule px-3 font-display text-ink-soft active:bg-paper-deep disabled:opacity-40 ${className}`}
      data-testid="reprint"
      onClick={() => {
        setState("busy");
        void shop
          .onServer((client) => client.reprintOrder(orderId))
          .then(() => setState("sent"))
          .catch((error: unknown) => setState(error instanceof Error ? error.message : t("errGeneric")));
      }}
    >
      {state === "sent" ? t("reprintSent") : state === "idle" || state === "busy" ? t("reprint") : state}
    </button>
  );
}
