"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { isDanError } from "@/lib/errors";
import { formatClock } from "@/lib/format";
import { type CopyKey, messageForError, useI18n } from "@/lib/i18n";
import { settingsRoute } from "@/lib/settings";
import { useIsOwner, useShop } from "@/lib/shop-context";
import type { ActivityEntry, StaffMember } from "@/lib/types";
import { Button, TextField } from "./ui";

/*
 * Named staff, each with their own PIN, and the activity log (RK, 27 Nov
 * 2026, DAN-44). Owner only. There is no shared counter PIN: staff sign in
 * with their name and PIN, and a shop has no PIN sign-in until the owner adds
 * someone here. Only the owner sees who did what.
 */

const PIN = /^\d{4,6}$/;
const digits = (value: string) => value.replace(/\D/g, "").slice(0, 6);

type Note = { text: string; failed: boolean } | null;

function useFailure() {
  const { t } = useI18n();
  return (caught: unknown): Note => ({
    text: messageForError(isDanError(caught) ? caught.code : undefined, t, caught instanceof Error ? caught.message : undefined),
    failed: true,
  });
}

function NoteLine({ note, testId }: { note: Note; testId: string }) {
  if (!note) return null;
  return (
    <p className={`text-sm ${note.failed ? "text-accent-ink" : "text-ink-soft"}`} role={note.failed ? "alert" : "status"} data-testid={testId}>
      {note.text}
    </p>
  );
}

/** Settings, Staff: who works here, each with their own PIN. */
export function StaffSettings() {
  const { t } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const failure = useFailure();
  const session = shop.persisted.session;
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  // Loaded once per sign-in: the context's helpers change with every health check.
  const signedIn = session?.token ?? "";
  useEffect(() => {
    if (!isOwner) return;
    let gone = false;
    shop
      .onOwner((client) => client.getStaff(), false)
      .then((list) => {
        if (!gone) setStaff(list);
      })
      .catch((caught: unknown) => {
        if (!gone) setNote(failure(caught));
      });
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, signedIn]);

  if (!isOwner || !session) return null;

  async function add(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setNote({ text: t("staffNameRequired"), failed: true });
    if (!PIN.test(pin)) return setNote({ text: t("loginPinInvalid"), failed: true });
    if (staff?.length === 0 && !window.confirm(t("staffFirstConfirm"))) return;
    setBusy(true);
    setNote(null);
    try {
      const added = await shop.onOwner((client) => client.addStaff(name.trim(), pin), true);
      setStaff((current) => [...(current ?? []), added]);
      setName("");
      setPin("");
      setNote({ text: t("staffAdded").replace("{name}", added.name), failed: false });
    } catch (caught) {
      setNote(failure(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl" data-testid="staff-settings">
      <p className="max-w-xl text-ink-soft">{t("staffLede")}</p>
      {session.addressName ? (
        <p className="mt-2 max-w-xl text-ink-soft">
          {t("staffAddressName")} <span className="font-display text-ink" data-testid="address-name">{session.addressName}</span>
        </p>
      ) : null}
      <p className="mt-4">
        <Link href={`${settingsRoute("staff")}/activity`} className="inline-flex min-h-11 items-center font-display underline" data-testid="activity-link">
          {t("activityTitle")} ›
        </Link>
      </p>

      <section aria-labelledby="staff-list-title" className="mt-8 border-t border-rule pt-6">
        <h2 id="staff-list-title" className="font-display text-2xl">
          {t("staffListTitle")}
        </h2>
        {staff === null ? (
          <p className="mt-3 text-ink-soft">{t("staffLoading")}</p>
        ) : staff.length === 0 ? (
          <p className="mt-3 max-w-xl border-l-2 border-accent pl-3" data-testid="staff-empty">
            {t("staffEmpty")}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-rule border-y border-rule" data-testid="staff-list">
            {staff.map((member) => (
              <StaffRow
                key={member.id}
                member={member}
                onChanged={(next) => setStaff((current) => (current ?? []).map((entry) => (entry.id === next.id ? next : entry)))}
                onRemoved={() => setStaff((current) => (current ?? []).filter((entry) => entry.id !== member.id))}
                onNote={setNote}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="staff-add-title" className="mt-8 border-t border-rule pt-6">
        <h2 id="staff-add-title" className="font-display text-2xl">
          {t("staffAddTitle")}
        </h2>
        <form onSubmit={add} className="mt-4 space-y-4" data-testid="staff-add">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField name="staff-new-name" label={t("staffName")} value={name} maxLength={40} autoComplete="off" onChange={(event) => setName(event.target.value)} required />
            <TextField
              name="staff-new-pin"
              label={t("staffPin")}
              value={pin}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              hint={t("staffPinHint")}
              onChange={(event) => setPin(digits(event.target.value))}
              required
            />
          </div>
          <Button type="submit" variant="accent" disabled={busy}>
            {t("staffAdd")}
          </Button>
        </form>
      </section>
      <div className="mt-4">
        <NoteLine note={note} testId="staff-status" />
      </div>
    </div>
  );
}

function StaffRow({
  member,
  onChanged,
  onRemoved,
  onNote,
}: {
  member: StaffMember;
  onChanged: (member: StaffMember) => void;
  onRemoved: () => void;
  onNote: (note: Note) => void;
}) {
  const { t } = useI18n();
  const shop = useShop();
  const failure = useFailure();
  const [mode, setMode] = useState<"view" | "rename" | "pin">("view");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    onNote(null);
    try {
      await work();
    } catch (caught) {
      onNote(failure(caught));
    } finally {
      setBusy(false);
    }
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "rename") {
      if (!value.trim()) return onNote({ text: t("staffNameRequired"), failed: true });
      void run(async () => {
        onChanged(await shop.onOwner((client) => client.renameStaff(member.id, value.trim()), true));
        setMode("view");
      });
    } else {
      if (!PIN.test(value)) return onNote({ text: t("loginPinInvalid"), failed: true });
      void run(async () => {
        onChanged(await shop.onOwner((client) => client.setStaffPin(member.id, value), true));
        setMode("view");
        onNote({ text: t("staffPinChanged").replace("{name}", member.name), failed: false });
      });
    }
  }

  return (
    <li className="py-3" data-testid="staff-row" data-name={member.name}>
      {mode === "view" ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="min-w-0 flex-1 font-display text-xl" data-testid="staff-name">
            {member.name}
          </span>
          <Button type="button" variant="line" disabled={busy} onClick={() => (setValue(member.name), setMode("rename"))}>
            {t("staffRename")}
          </Button>
          <Button type="button" variant="line" disabled={busy} onClick={() => (setValue(""), setMode("pin"))}>
            {t("staffNewPin")}
          </Button>
          <Button
            type="button"
            variant="line"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(t("staffRemoveConfirm").replace("{name}", member.name))) return;
              void run(async () => {
                await shop.onOwner((client) => client.removeStaff(member.id), true);
                onRemoved();
              });
            }}
          >
            {t("staffRemove")}
          </Button>
        </div>
      ) : (
        <form onSubmit={save} className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            {mode === "rename" ? (
              <TextField name="staff-rename" label={t("staffName")} value={value} maxLength={40} autoComplete="off" onChange={(event) => setValue(event.target.value)} required />
            ) : (
              <TextField
                name="staff-pin"
                label={t("staffNewPinFor").replace("{name}", member.name)}
                value={value}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                hint={t("staffNewPinHint")}
                onChange={(event) => setValue(digits(event.target.value))}
                required
              />
            )}
          </div>
          <Button type="submit" variant="accent" disabled={busy}>
            {t("staffSave")}
          </Button>
          <Button type="button" variant="line" disabled={busy} onClick={() => setMode("view")}>
            {t("staffCancel")}
          </Button>
        </form>
      )}
    </li>
  );
}

/** What an entry says was done, in the page's language; a change without words of its own by its name. */
const ACTIONS: Record<string, CopyKey> = {
  signed_in: "actSignedIn",
  logout: "actSignedOut",
  order_taken: "actOrderTaken",
  order_placed_online: "actOrderOnline",
  order_moved: "actOrderMoved",
  order_changed: "actOrderChanged",
  order_cancelled: "actOrderCancelled",
  sold_out_on: "actSoldOutOn",
  sold_out_off: "actSoldOutOff",
  dish_changed: "actDishChanged",
  courier_booked: "actCourierBooked",
  courier_called_off: "actCourierCalledOff",
  changed_to_collection: "actToCollection",
  delivery_by_set: "actDeliveryBy",
  bank_transfer_paid: "actBankPaid",
  rejectBankTransfer: "actBankRejected",
  addStaff: "actStaffAdded",
  renameStaff: "actStaffRenamed",
  setStaffPin: "actStaffPin",
  removeStaff: "actStaffRemoved",
  createCustomer: "actCustomer",
  addStamp: "actStamp",
  redeemReward: "actReward",
  reprintOrder: "actReprint",
  testPrint: "actTestPrint",
  savePrinter: "actPrinterSaved",
  removePrinter: "actPrinterRemoved",
};

/** "updateBoard" as "Update board", for a change with no words of its own. */
export function actionWords(action: string): string {
  const spaced = action.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The start and end of a day, as typed in a date field (this device's time). */
export function dayBounds(day: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  const from = new Date(year, month - 1, date);
  const to = new Date(year, month - 1, date + 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Settings, Staff, Activity: everything people did in the shop. Owner only. */
export function ActivityView() {
  const { t, locale } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const failure = useFailure();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [by, setBy] = useState("");
  const [day, setDay] = useState("");
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const owner = shop.persisted.session?.staff;

  // Per sign-in: the context's helpers change with every health check.
  const signedIn = shop.persisted.session?.token ?? "";
  const fetchPage = useCallback(
    (before: string | null) => {
      const bounds = dayBounds(day);
      return shop.onOwner((client) => client.getActivity({ by: by || null, from: bounds?.from ?? null, to: bounds?.to ?? null, before, limit: 50 }), false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [by, day, signedIn],
  );

  // The newest page, again whenever the filters change.
  useEffect(() => {
    if (!isOwner) return;
    let gone = false;
    fetchPage(null)
      .then((page) => {
        if (gone) return;
        setEntries(page.entries);
        setMore(page.more);
        setNote(null);
      })
      .catch((caught: unknown) => {
        if (!gone) setNote(failure(caught));
      });
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, fetchPage]);

  async function older() {
    setBusy(true);
    try {
      const page = await fetchPage(entries?.at(-1)?.at ?? null);
      setEntries((current) => [...(current ?? []), ...page.entries]);
      setMore(page.more);
    } catch (caught) {
      setNote(failure(caught));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!isOwner) return;
    shop
      .onOwner((client) => client.getStaff(), false)
      .then(setStaff)
      .catch(() => setStaff([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, signedIn]);

  if (!isOwner) return null;

  return (
    <div className="max-w-4xl" data-testid="activity">
      <p className="max-w-xl text-ink-soft">{t("activityLede")}</p>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="mb-1 block font-display text-sm">{t("activityWho")}</span>
          <select className="min-h-11 border border-rule bg-paper px-3" value={by} onChange={(event) => setBy(event.target.value)} data-testid="activity-by">
            <option value="">{t("activityEveryone")}</option>
            {owner ? <option value={owner.id}>{owner.name}</option> : null}
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
            <option value="online">{t("activityOnline")}</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-display text-sm">{t("activityDay")}</span>
          <input type="date" className="min-h-11 border border-rule bg-paper px-3" value={day} onChange={(event) => setDay(event.target.value)} data-testid="activity-day" />
        </label>
      </div>
      <NoteLine note={note} testId="activity-status" />
      {entries === null ? (
        <p className="mt-6 text-ink-soft">{t("activityLoading")}</p>
      ) : entries.length === 0 ? (
        <p className="mt-6 text-ink-soft" data-testid="activity-empty">
          {t("activityEmpty")}
        </p>
      ) : (
        <ol className="mt-6 divide-y divide-rule border-y border-rule">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3" data-testid="activity-entry" data-action={entry.action}>
              <time className="w-32 shrink-0 text-sm text-ink-soft" dateTime={entry.at}>
                {new Date(entry.at).toLocaleDateString(locale, { day: "numeric", month: "short" })} {formatClock(new Date(entry.at))}
              </time>
              <span className="w-32 shrink-0 font-display" data-testid="activity-who">
                {entry.byRole === "online" ? t("activityOnline") : entry.byName}
              </span>
              <span className="min-w-0 flex-1" data-testid="activity-what">
                {ACTIONS[entry.action] ? t(ACTIONS[entry.action]) : actionWords(entry.action)}
                {entry.orderNumber && entry.orderId ? (
                  <>
                    {" "}
                    <Link href={`/shop/orders/${entry.orderId}`} className="underline">
                      #{entry.orderNumber}
                    </Link>
                  </>
                ) : null}
                {entry.detail ? <span className="text-ink-soft"> · {entry.detail}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      )}
      {more ? (
        <div className="mt-4">
          <Button type="button" variant="line" disabled={busy} onClick={() => void older()}>
            {t("activityOlder")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
