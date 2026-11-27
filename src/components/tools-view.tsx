"use client";

import { useRef, useState } from "react";
import { isDanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { useShop } from "@/lib/shop-context";
import { writePersisted } from "@/lib/storage";
import { normalizeOrderingAddress, orderingAddressFromCloud, parseTables, tableLink } from "@/lib/tables";
import type { Shop } from "@/lib/types";
import { PrintersSection } from "./printers-section";
import { QrCode, qrModules } from "./qr-code";
import { Button, TextField } from "./ui";

/** The demo's own ordering site: the website's "Try the demo" QR code opens it too. */
const DEMO_ORDERING = "https://order.dan.partners";

/** Setting-up tools: table QR codes and the shop's printers. */
/** Settings, Tables & printers: table QR cards and the shop's receipt printers. */
export function TablesSettings() {
  return (
    <div>
      {/* Printing from this page is the A4 card sheet; tickets keep their own size elsewhere. */}
      <style>{"@page { size: A4; margin: 10mm; }"}</style>
      <TableQrCodes />
      <PrintersSection />
    </div>
  );
}

function TableQrCodes() {
  const { t } = useI18n();
  const shop = useShop();
  const session = shop.persisted.session;
  const suggested = session?.mode === "demo" ? DEMO_ORDERING : orderingAddressFromCloud(session?.cloudUrl);
  const [address, setAddress] = useState(() => shop.persisted.orderingAddress ?? suggested);
  const [tables, setTables] = useState("1-12");

  let addressError: string | null = null;
  let origin = "";
  if (address.trim()) {
    try {
      origin = normalizeOrderingAddress(address);
    } catch (error) {
      addressError = isDanError(error) ? error.message : String(error);
    }
  }
  let tablesError: string | null = null;
  let labels: string[] = [];
  try {
    labels = parseTables(tables);
  } catch (error) {
    tablesError = isDanError(error) ? error.message : String(error);
  }
  const ready = Boolean(origin) && !tablesError && labels.length > 0 && session;

  return (
    <section aria-labelledby="qr-title">
      <div className="no-print max-w-3xl">
        <h2 id="qr-title" className="font-display text-2xl">
          {t("qrTitle")}
        </h2>
        <p className="mt-1 mb-4 text-ink-soft">{t("qrLede")}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            name="ordering-address"
            label={t("qrAddress")}
            value={address}
            inputMode="url"
            autoComplete="off"
            placeholder="https://yourshop.dan.partners"
            hint={address.trim() ? t("qrAddressHint") : t("qrAddressMissing")}
            error={addressError ?? undefined}
            onChange={(event) => setAddress(event.target.value)}
            onBlur={() => {
              if (origin) {
                setAddress(origin);
                writePersisted({ orderingAddress: origin });
              }
            }}
          />
          <TextField
            name="tables"
            label={t("qrTables")}
            value={tables}
            autoComplete="off"
            hint={t("qrTablesHint")}
            error={tablesError ?? undefined}
            onChange={(event) => setTables(event.target.value)}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="accent"
            disabled={!ready}
            onClick={() => {
              writePersisted({ orderingAddress: origin });
              window.print();
            }}
          >
            {t("qrPrint")}
          </Button>
          {ready ? (
            <span className="text-ink-soft" data-testid="qr-count">
              {labels.length} {t("qrCards")}
            </span>
          ) : null}
        </div>
      </div>

      {ready ? (
        <div className="qr-sheet mt-6" data-testid="qr-sheet">
          {labels.map((label) => (
            <TableCard key={label} shopInfo={session.shop} table={label} link={tableLink(origin, label)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** One card to cut out and stand on a table. Black on white, whatever the theme. */
function TableCard({ shopInfo, table, link }: { shopInfo: Shop; table: string; link: string }) {
  const { t } = useI18n();
  const card = useRef<HTMLDivElement>(null);
  return (
    <div ref={card} className="qr-card" data-testid="qr-card" data-table={table}>
      <p className="font-display text-lg leading-tight">
        {shopInfo.name} <span className="font-zh">{shopInfo.nameZh}</span>
      </p>
      <p className="mt-1 font-display text-sm tracking-[0.18em] uppercase">
        {t("table")} · 枱號
      </p>
      <p className="qr-table font-display text-6xl leading-none">{table}</p>
      <QrCode text={link} className="qr-image" label={`${t("table")} ${table}: ${link}`} />
      <p className="font-display text-lg leading-tight">
        Scan to order · <span className="font-zh">掃碼點餐</span>
      </p>
      <p className="qr-link text-[0.7rem] break-all">{link}</p>
      <button
        type="button"
        className="no-print mt-2 min-h-11 cursor-pointer border border-black/30 px-3 font-display active:bg-black/5"
        onClick={() => downloadCard(card.current, shopInfo, table, link)}
      >
        {t("qrDownload")} · {t("table")} {table}
      </button>
    </div>
  );
}

/** The card as a PNG, for a print shop: drawn on a canvas in the page's own fonts. */
function downloadCard(element: HTMLElement | null, shopInfo: Shop, table: string, link: string) {
  if (!element) return;
  const family = getComputedStyle(element.querySelector(".font-display") ?? element).fontFamily;
  const zh = getComputedStyle(element.querySelector(".font-zh") ?? element).fontFamily;
  const width = 1200;
  const height = 1600;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#000";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.font = `56px ${family}, ${zh}`;
  context.fillText(`${shopInfo.name} ${shopInfo.nameZh}`.trim(), width / 2, 130, width - 120);
  context.font = `40px ${family}, ${zh}`;
  context.fillText("TABLE · 枱號", width / 2, 220);
  context.font = `240px ${family}`;
  context.fillText(table, width / 2, 450, width - 120);
  const rows = qrModules(link);
  const quiet = 4;
  const cell = Math.floor(760 / (rows.length + quiet * 2));
  const side = cell * (rows.length + quiet * 2);
  const left = Math.round((width - side) / 2);
  const top = 520;
  rows.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) context.fillRect(left + (x + quiet) * cell, top + (y + quiet) * cell, cell, cell);
    }),
  );
  context.font = `56px ${family}, ${zh}`;
  context.fillText("Scan to order · 掃碼點餐", width / 2, top + side + 90);
  context.font = `30px ${family}`;
  context.fillText(link, width / 2, top + side + 150, width - 120);
  const anchor = document.createElement("a");
  anchor.download = `table-${table}.png`;
  anchor.href = canvas.toDataURL("image/png");
  anchor.click();
}
