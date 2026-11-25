"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { formatClock, formatPence, fulfilmentLabel, orderLabel, primaryName } from "@/lib/format";
import { useI18n, type CopyKey } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import { ticketSections, type TicketSection } from "@/lib/ticket";
import type { Order, Shop, Station } from "@/lib/types";
import { Button, PageTitle } from "./ui";

const STATION_KEY: Record<Station, CopyKey> = {
  wok: "stationWok",
  fryer: "stationFryer",
  rice: "stationRice",
  counter: "stationCounter",
};

const STATION_ZH: Record<Station, CopyKey> = {
  wok: "stationWokZh",
  fryer: "stationFryerZh",
  rice: "stationRiceZh",
  counter: "stationCounterZh",
};

export function TicketView() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const params = useSearchParams();
  const [mode, setMode] = useState<"one" | "split">("one");
  const requested = params.get("order");
  const orders = shop.snapshot?.orders ?? [];
  const order =
    orders.find((entry) => entry.id === requested) ??
    orders.find((entry) => entry.id === shop.persisted.activeOrderId) ??
    orders[0];

  return (
    <div>
      <div className="no-print mb-6">
        <PageTitle className="mb-4" title={t("ticketTitle")} gloss={locale === "zh-Hant" ? "Ticket" : "廚單"} />
        <div className="flex flex-wrap gap-2">
          <Button variant={mode === "one" ? "ink" : "line"} onClick={() => setMode("one")}>
            {t("ticketOne")}
          </Button>
          <Button variant={mode === "split" ? "ink" : "line"} onClick={() => setMode("split")}>
            {t("ticketSplit")}
          </Button>
          <Button variant="line" onClick={() => window.print()}>
            {t("ticketPrint")}
          </Button>
        </div>
      </div>
      {!order || !shop.snapshot ? (
        <p className="text-ink-soft">{t("ticketEmpty")}</p>
      ) : mode === "one" ? (
        <Slip order={order} shopInfo={shop.snapshot.shop} sections={ticketSections(order)} />
      ) : (
        <div className="ticket-print flex flex-wrap items-start gap-6">
          {ticketSections(order).map((section) => (
            <Slip key={section.station} order={order} shopInfo={shop.snapshot!.shop} sections={[section]} />
          ))}
        </div>
      )}
    </div>
  );
}

function Slip({ order, shopInfo, sections }: { order: Order; shopInfo: Shop; sections: TicketSection[] }) {
  const { t, locale } = useI18n();
  return (
    <div className="torn-wrap ticket-print max-w-full">
      <article className="ticket-slip torn border border-b-0 border-slip-ink/15 px-4 py-5 font-ticket text-[13px] leading-snug" data-testid="ticket-slip">
        <header className="text-center">
          <p className="font-display text-xl tracking-[0.14em]">{shopInfo.name.toUpperCase()}</p>
          <p className="font-zh text-base">
            {shopInfo.nameZh}
            {locale === "zh-Hant" ? "外賣" : " · takeaway"}
          </p>
          <p>{shopInfo.address}</p>
          <p>{shopInfo.phone}</p>
        </header>
        <Rule />
        <p className="flex justify-between font-display text-base">
          <span>{orderLabel(order.number, t("numberWaiting"))}</span>
          <span data-testid="ticket-fulfilment">{fulfilmentLabel(order, t).toUpperCase()}</span>
        </p>
        <p className="flex justify-between">
          <span>{formatClock(new Date(order.createdAt))}</span>
          <span>{t(order.source === "online" ? "sourceOnline" : order.source === "phone" ? "sourcePhone" : "sourceCounter")}</span>
        </p>
        {order.customerName ? <p>{order.customerName}</p> : null}
        {order.phone ? <p>{order.phone}</p> : null}
        {order.address ? <p>{order.address}</p> : null}
        {order.notes ? <p className="mt-1">* {order.notes}</p> : null}
        {sections.map((section) => (
          <section key={section.station}>
            <Rule />
            <h2 className="font-display text-sm tracking-[0.16em]">
              {t(STATION_KEY[section.station]).toUpperCase()} <span className="font-zh tracking-normal">{t(STATION_ZH[section.station])}</span>
            </h2>
            <ul className="mt-1">
              {section.lines.map((line) => (
                <li key={`${section.station}-${line.number}`} className="mt-1">
                  <p>
                    {line.qty} × {line.number} {line.nameEn}
                  </p>
                  <p className="pl-8 font-zh">{line.nameZh}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <Rule />
        <p className="flex justify-between font-display text-base">
          <span>{t("tillTotal").toUpperCase()}</span>
          <span>{formatPence(order.totalPence)}</span>
        </p>
        {order.payment ? (
          <p className="mt-1 border border-slip-ink px-2 py-1 text-center font-display text-base tracking-[0.12em]" data-testid="ticket-payment">
            {order.payment.status === "paid" ? t("ticketPaidCard") : `${t("ticketToPay")} ${formatPence(order.totalPence)}`}
          </p>
        ) : null}
        <p className="mt-3 text-center font-zh">{t("ticketThanks")}</p>
        <p className="text-center font-display text-[0.68rem] tracking-[0.18em] uppercase">{primaryName(t("ticketBill"), "帳單", locale)}</p>
      </article>
    </div>
  );
}

function Rule() {
  return <div className="my-2 border-t border-dashed border-slip-ink/50" aria-hidden />;
}
