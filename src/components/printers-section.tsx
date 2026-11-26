"use client";

import { useCallback, useEffect, useState } from "react";
import { isDanError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { STATION_GLOSS, STATION_LABEL } from "@/lib/stations";
import { STATIONS, type Paper, type Printer, type PrinterInput, type Station } from "@/lib/types";
import { Button, Dialog, TextField } from "./ui";

const BLANK: PrinterInput = { name: "", host: "", port: 9100, paper: "MM80", stations: [], copies: 1, enabled: true };

/**
 * The shop's receipt printers. The owner adds and changes them; anyone can
 * send a test print. They live on the shop's machine, which does the printing.
 */
export function PrintersSection() {
  const { t } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const [printers, setPrinters] = useState<Printer[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState<PrinterInput | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const onServer = shop.onServer;

  const load = useCallback(() => {
    void onServer((client) => client.getPrinters())
      .then((list) => {
        setPrinters(list);
        setProblem(null);
      })
      .catch((error: unknown) => {
        const code = isDanError(error) ? error.code : undefined;
        setProblem(code === "printers_shop_only" ? t("printersShopOnly") : code === "printers_demo" ? t("printersDemo") : error instanceof Error ? error.message : t("errGeneric"));
      });
  }, [onServer, t]);

  // The list again when the server in use changes (a printer is the shop's).
  const inUse = shop.servers.inUse;
  useEffect(() => {
    load();
  }, [load, inUse]);

  const status = (id: string) => shop.servers.printers.find((printer) => printer.printerId === id);

  return (
    <section aria-labelledby="printers-title" className="no-print mt-10 max-w-3xl" data-testid="printers">
      <h2 id="printers-title" className="font-display text-2xl">
        {t("printersTitle")}
      </h2>
      <p className="mt-1 mb-4 text-ink-soft">{t("printersLede")}</p>
      {problem ? (
        <p className="border-l-2 border-accent pl-3" data-testid="printers-problem">
          {problem}
        </p>
      ) : printers === null ? null : (
        <>
          {printers.length === 0 ? <p className="text-ink-soft">{t("printersNone")}</p> : null}
          <ul className="divide-y divide-rule border-y border-rule">
            {printers.map((printer) => {
              const now = status(printer.id);
              const failing = Boolean(now?.failing);
              return (
                <li key={printer.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" data-testid="printer-row">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg">
                      {printer.name}
                      <span className={`ml-3 text-sm ${!printer.enabled ? "text-ink-soft" : failing ? "text-[#d7372a]" : "text-[#2f7d4f]"}`} data-testid="printer-state">
                        {!printer.enabled ? t("printersOff") : failing ? `${t("printersFailing")}${now?.waiting ? ` · ${now.waiting} ${t("printersWaiting")}` : ""}` : t("printersOk")}
                      </span>
                    </p>
                    <p className="text-sm text-ink-soft">
                      {printer.host}:{printer.port} · {printer.paper === "MM58" ? "58 mm" : "80 mm"} ·{" "}
                      {printer.stations.length === 0 ? t("printersWhole") : printer.stations.map((station) => t(STATION_LABEL[station])).join(", ")}
                      {printer.copies > 1 ? ` · ${printer.copies} ${t("printersCopies").toLowerCase()}` : ""}
                    </p>
                    {failing && now?.lastError ? <p className="text-sm text-[#d7372a]">{now.lastError}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="line"
                      onClick={() =>
                        void onServer((client) => client.testPrint(printer.id))
                          .then(() => setNotice(t("printersTestSent")))
                          .catch((error: unknown) => setNotice(error instanceof Error ? error.message : t("errGeneric")))
                      }
                    >
                      {t("printersTest")}
                    </Button>
                    {isOwner ? (
                      <Button variant="ghost" onClick={() => setEditing({ ...printer })}>
                        {t("printersEditButton")}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {notice ? (
            <p className="mt-3 text-sm" role="status" data-testid="printers-notice">
              {notice}
            </p>
          ) : null}
          {isOwner ? (
            <Button variant="accent" className="mt-4" onClick={() => setEditing({ ...BLANK })}>
              {t("printersAdd")}
            </Button>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">{t("printersOwnerOnly")}</p>
          )}
        </>
      )}
      {editing ? (
        <PrinterForm
          start={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
    </section>
  );
}

function PrinterForm({ start, onClose, onDone }: { start: PrinterInput; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const shop = useShop();
  const [form, setForm] = useState<PrinterInput>(start);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<PrinterInput>) => setForm((current) => ({ ...current, ...patch }));
  const whole = form.stations.length === 0;
  const toggle = (station: Station) =>
    set({ stations: form.stations.includes(station) ? form.stations.filter((s) => s !== station) : STATIONS.filter((s) => s === station || form.stations.includes(s)) });
  const chip = (on: boolean) =>
    `min-h-11 cursor-pointer border px-3 font-display active:scale-[0.97] ${on ? "border-ink bg-ink text-paper" : "border-rule bg-paper text-ink-soft active:bg-paper-deep"}`;

  const run = (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    void work()
      .then(onDone)
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : t("errGeneric"));
        setBusy(false);
      });
  };

  return (
    <Dialog open title={start.id ? t("printersEdit") : t("printersAdd")} onClose={onClose}>
      <form
        className="space-y-4"
        data-testid="printer-form"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => shop.onServer((client) => client.savePrinter({ ...form, port: Number(form.port) || 9100 })));
        }}
      >
        <TextField name="printer-name" label={t("printersName")} hint={t("printersNameHint")} value={form.name} onChange={(event) => set({ name: event.target.value })} />
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
          <TextField name="printer-host" label={t("printersAddress")} hint={t("printersAddressHint")} inputMode="url" autoComplete="off" value={form.host} onChange={(event) => set({ host: event.target.value })} />
          <TextField name="printer-port" label={t("printersPort")} inputMode="numeric" value={String(form.port ?? 9100)} onChange={(event) => set({ port: Number(event.target.value.replace(/\D/g, "")) || undefined })} />
        </div>
        <fieldset>
          <legend className="font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase">{t("printersPaper")}</legend>
          <div className="mt-2 flex gap-2">
            {(["MM80", "MM58"] as Paper[]).map((paper) => (
              <button key={paper} type="button" aria-pressed={form.paper === paper} className={chip(form.paper === paper)} onClick={() => set({ paper })}>
                {paper === "MM80" ? "80 mm" : "58 mm"}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase">{t("kitchenStations")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" aria-pressed={whole} className={chip(whole)} onClick={() => set({ stations: [] })}>
              {t("printersWhole")}
            </button>
            {STATIONS.map((station) => (
              <button key={station} type="button" aria-pressed={form.stations.includes(station)} className={chip(form.stations.includes(station))} onClick={() => toggle(station)}>
                {t(STATION_LABEL[station])} <span className="font-zh text-sm opacity-80">{t(STATION_GLOSS[station])}</span>
              </button>
            ))}
          </div>
          <p className="mt-1 text-sm text-ink-soft">{t("printersWholeHint")}</p>
        </fieldset>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase">{t("printersCopies")}</span>
            <button type="button" aria-label="−" className="min-h-11 min-w-11 cursor-pointer border border-rule font-display active:bg-paper-deep" onClick={() => set({ copies: Math.max(1, form.copies - 1) })}>
              −
            </button>
            <span className="w-6 text-center font-display" data-testid="printer-copies">
              {form.copies}
            </span>
            <button type="button" aria-label="+" className="min-h-11 min-w-11 cursor-pointer border border-rule font-display active:bg-paper-deep" onClick={() => set({ copies: Math.min(5, form.copies + 1) })}>
              +
            </button>
          </div>
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" checked={form.enabled} onChange={(event) => set({ enabled: event.target.checked })} />
            {t("printersOn")}
          </label>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-accent-ink">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {start.id ? (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t("printersRemoveConfirm"))) run(() => shop.onServer((client) => client.removePrinter(start.id!)));
              }}
            >
              {t("printersRemove")}
            </Button>
          ) : null}
          <span className="flex-1" />
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" variant="accent" disabled={busy}>
            {t("printersSave")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
