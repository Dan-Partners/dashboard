"use client";

import { TicketSounds } from "./ticket-sounds";
import { useEffect, useState } from "react";
import { isDanError } from "@/lib/errors";
import { kitchenTickets, newDoneMemory, noteOrders, pickStation, type KitchenTicket } from "@/lib/focus";
import { ago, fulfilmentLabel, orderLabel, primaryName, secondaryName } from "@/lib/format";
import { useI18n, type CopyKey } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import { STATION_GLOSS, STATION_LABEL } from "@/lib/stations";
import { writePersisted } from "@/lib/storage";
import { useTapGuard, type TapGuard } from "@/lib/tap-guard";
import { columnName, columnOf, DEFAULT_BOARD, nextStep, type Board } from "@/lib/board";
import { STATIONS, type OrderStatus, type Station } from "@/lib/types";
import { stepLabel } from "./orders-board";
import { ReprintButton } from "./print-strip";
import { StationPicker } from "./station-picker";
import { Button, PageTitle } from "./ui";

/** Kept for the life of the page, so moving between screens keeps it. */
const doneMemory = newDoneMemory();

export const STATUS_WORD: Record<OrderStatus, CopyKey> = {
  new: "statusNew",
  preparing: "statusPreparing",
  ready: "statusReady",
  completed: "statusCompleted",
  cancelled: "statusCancelled",
};

/** The colours of the glowing borders, for the status word too. */
export const STATUS_COLOUR: Record<OrderStatus, string> = {
  new: "#1f9d55",
  preparing: "#2f6fdb",
  ready: "#d7372a",
  completed: "#8a8a8a",
  cancelled: "#8a8a8a",
};

/** The kitchen: live tickets, oldest first, filtered by station without hiding any. */
export function KitchenView() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const guard = useTapGuard();
  const locked = shop.persisted.focus?.position === "kitchen";
  const stations = shop.persisted.kitchenStations;
  const orders = shop.snapshot?.orders ?? [];
  const board = shop.snapshot?.board ?? DEFAULT_BOARD;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  noteOrders(doneMemory, orders, now);
  const tickets = kitchenTickets(orders, stations, doneMemory, now);

  return (
    <div>
      {locked ? null : <PageTitle title={t("kitchenTitle")} gloss={locale === "zh-Hant" ? "Kitchen" : "廚房"} />}
      <TicketSounds place="kitchen" />
      <StationPicker
        value={stations}
        onToggle={(station) => writePersisted({ kitchenStations: pickStation(stations, station) })}
        onAll={() => writePersisted({ kitchenStations: [...STATIONS] })}
      />
      {error ? (
        <p className="mt-3 border-l-2 border-accent pl-3" role="alert">
          {error}
        </p>
      ) : null}
      {tickets.length === 0 ? <p className="mt-8 font-display text-2xl text-ink-soft">{t("kitchenEmpty")}</p> : null}
      <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] items-start gap-5">
        {tickets.map((ticket) => (
          <KitchenCard key={ticket.order.id} ticket={ticket} board={board} stations={stations} now={now} guard={guard} onError={setError} />
        ))}
      </div>
    </div>
  );
}

function KitchenCard({
  ticket,
  board,
  stations,
  now,
  guard,
  onError,
}: {
  ticket: KitchenTicket;
  board: Board;
  stations: Station[];
  now: number;
  guard: TapGuard;
  onError: (message: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const shop = useShop();
  const [busy, setBusy] = useState(false);
  const { order, sections, forPicked } = ticket;
  const status = order.status;
  const column = columnOf(board, order);
  const word = column ? columnName(column, locale) : t(STATUS_WORD[status]);
  const colour = column?.colour ?? STATUS_COLOUR[status];
  // The kitchen moves tickets on until they are ready; the pass hands them over.
  const step = nextStep(board, order);
  const next = step && step.kind !== "done" && column?.role !== "ready" ? { label: step.kind === "accept" ? t("kitchenStart") : stepLabel(step, order, t, locale) } : null;

  return (
    <article
      className={`glow ${status === "completed" ? "glow-done" : ""} bg-paper-raised p-4 ${forPicked ? "" : "opacity-60"}`}
      style={{ "--glow": colour } as React.CSSProperties}
      data-testid="kitchen-ticket"
      data-status={status}
      data-column={column?.id}
      data-for-picked={forPicked ? "true" : "false"}
      aria-label={`${orderLabel(order.number, t("numberWaiting"))} · ${word}`}
    >
      {/* The highlight: which stations this order needs; the ones picked here, large. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule pb-2" data-testid="station-strip">
        {sections.map((section) => {
          const picked = stations.includes(section.station);
          return (
            <span
              key={section.station}
              className={`font-display uppercase ${picked ? "text-3xl leading-none tracking-[0.06em] text-ink" : "text-base tracking-[0.1em] text-ink-soft"}`}
              data-picked={picked ? "true" : "false"}
            >
              {t(STATION_LABEL[section.station])} <span className="font-zh normal-case">{t(STATION_GLOSS[section.station])}</span>
            </span>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <h3 className={`font-display leading-none ${forPicked ? "text-4xl" : "text-2xl"}`}>{orderLabel(order.number, t("numberWaiting"))}</h3>
        <span className="px-2 py-1 font-display text-sm tracking-[0.12em] text-white uppercase" style={{ background: colour }}>
          {word}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {ago(order.createdAt, now, locale, t("justNow"))} · {fulfilmentLabel(order, t)}
      </p>
      {order.notes ? <p className="mt-2 border-l-4 border-accent pl-2 font-display text-lg">{order.notes}</p> : null}
      {forPicked ? null : <p className="mt-2 text-sm italic text-ink-soft">{t("kitchenNotHere")}</p>}

      <div className="mt-3 space-y-3">
        {sections.map((section) => {
          const picked = stations.includes(section.station);
          return (
            <section key={section.station} className={picked ? "" : "opacity-50"} data-picked={picked ? "true" : "false"}>
              <h4 className="font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t(STATION_LABEL[section.station])}</h4>
              <ul>
                {section.lines.map((line) => (
                  <li key={line.number} className={`flex gap-2 ${picked ? "text-2xl leading-snug" : "text-sm"}`}>
                    <span className="font-display tabular-nums">{line.qty}×</span>
                    <span className="font-display text-accent-ink">{line.number}</span>
                    <span className="min-w-0 flex-1">
                      {primaryName(line.nameEn, line.nameZh, locale)}
                      <span className={`ml-2 font-zh text-ink-soft ${picked ? "text-lg" : ""}`}>{secondaryName(line.nameEn, line.nameZh, locale)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {next ? (
        <Button
          variant={forPicked ? "accent" : "line"}
          className={`mt-4 w-full ${forPicked ? "min-h-14 text-2xl" : ""}`}
          disabled={busy}
          onClick={() => {
            const done = guard.run(() => shop.advanceOrder(order));
            if (!done) return;
            setBusy(true);
            onError(null);
            void done
              .catch((error: unknown) => onError(isDanError(error) ? error.message : t("errGeneric")))
              .finally(() => setBusy(false));
          }}
        >
          {next.label}
        </Button>
      ) : null}
      <ReprintButton orderId={order.id} className="mt-2 w-full" />
    </article>
  );
}
