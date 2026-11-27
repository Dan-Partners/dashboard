"use client";

import { useState } from "react";
import { useBoardPaper } from "@/lib/use-board-colour";
import { checkBoard, columnName, DEFAULT_BOARD, shownColour, MAX_COLUMNS, newColumnId, type Board, type BoardColumn, type ColumnRole } from "@/lib/board";
import { isDanError } from "@/lib/errors";
import { messageForError, useI18n, type CopyKey } from "@/lib/i18n";
import { useIsOwner, useShop } from "@/lib/shop-context";
import { Button } from "./ui";

const ROLE_WORD: Record<ColumnRole, CopyKey> = {
  incoming: "roleIncoming",
  in_progress: "roleInProgress",
  ready: "roleReady",
  completed: "roleCompleted",
};

/**
 * The owner sets the board's columns. The counter PIN sees the same screen,
 * read-only, as with the theme. The shop server checks and stores it.
 */
export function BoardView({ children }: { children?: React.ReactNode }) {
  const { t, locale } = useI18n();
  const shop = useShop();
  const isOwner = useIsOwner();
  const paper = useBoardPaper();
  const saved = shop.snapshot?.board ?? DEFAULT_BOARD;
  const [draft, setDraft] = useState<Board | null>(null);
  const board = draft ?? saved;
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  /** Tickets that would move, waiting for the owner's yes. */
  const [moving, setMoving] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);

  const edit = (change: (columns: BoardColumn[]) => BoardColumn[]) => {
    setMessage(null);
    setMoving(null);
    setDraft({ columns: change(board.columns.map((column) => ({ ...column }))) });
  };
  const failed = (error: unknown) =>
    setMessage({ text: messageForError(isDanError(error) ? error.code : undefined, t, error instanceof Error ? error.message : undefined), failed: true });
  const nameOf = (id: string) => {
    const column = [...board.columns, ...saved.columns].find((entry) => entry.id === id);
    return column ? columnName(column, locale) : id;
  };

  const save = (moveTickets: boolean) => {
    setMessage(null);
    let next: Board;
    try {
      next = checkBoard(board);
    } catch (error) {
      failed(error);
      return;
    }
    setBusy(true);
    const run = async () => {
      if (!moveTickets) {
        const preview = await shop.previewBoard(next);
        if (preview.stuckTickets > 0) {
          setMessage({ text: `${preview.stuckTickets} ${t("boardStuck")}`, failed: true });
          return;
        }
        if (preview.moves.length) {
          setMoving(preview.moves.map((move) => `${move.tickets} ${t("boardTickets")}: ${nameOf(move.fromColumn)} → ${nameOf(move.toColumn)}`).join(" · "));
          return;
        }
      }
      await shop.saveBoard(next, moveTickets);
      setDraft(null);
      setMoving(null);
      setMessage({ text: t("boardSaved"), failed: false });
    };
    void run()
      .catch(failed)
      .finally(() => setBusy(false));
  };

  const reset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      window.setTimeout(() => setConfirmReset(false), 4000);
      return;
    }
    setConfirmReset(false);
    setBusy(true);
    void shop
      .resetBoard()
      .then(() => {
        setDraft(null);
        setMoving(null);
        setMessage({ text: t("boardResetDone"), failed: false });
      })
      .catch(failed)
      .finally(() => setBusy(false));
  };

  const addColumn = () =>
    edit((columns) => {
      // A new in-progress column, just before the first ready one.
      const at = columns.findIndex((column) => column.role === "ready");
      columns.splice(at, 0, { id: newColumnId(), nameEn: "", nameZh: "", role: "in_progress", colour: "#7a4fd0" });
      return columns;
    });

  /** The roles a column may take where it stands: the flow must keep its order. */
  const rolesAt = (index: number): ColumnRole[] => {
    const column = board.columns[index];
    if (column.role === "incoming" || column.role === "completed") return [column.role];
    return ["in_progress", "ready"];
  };

  const canMove = (index: number, by: -1 | 1) => {
    const other = board.columns[index + by];
    const column = board.columns[index];
    return Boolean(other) && column.role !== "incoming" && column.role !== "completed" && other.role !== "incoming" && other.role !== "completed";
  };

  return (
    <div className="max-w-3xl">
      <p className="mb-6 text-ink-soft">{t("boardLede")}</p>
      {!isOwner ? (
        <p className="mb-6 border-l-2 border-accent pl-3" data-testid="board-owner-only">
          {t("boardOwnerOnly")}
        </p>
      ) : null}

      <section aria-labelledby="board-columns">
        <h2 id="board-columns" className="font-display text-2xl">
          {t("boardColumns")}
        </h2>
        <ol className="mt-2 divide-y divide-rule border-y border-rule" data-testid="board-columns">
          {board.columns.map((column, index) => (
            <li key={column.id} className="flex flex-wrap items-end gap-3 py-3" data-testid={`board-column-${index}`} style={{ borderLeft: `6px solid ${shownColour(column.colour, paper).colour}`, paddingLeft: "0.75rem" }}>
              <label className="min-w-[8rem] flex-1">
                <span className="block font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("boardNameEn")}</span>
                <input
                  className="mt-1 min-h-11 w-full border border-rule bg-paper-raised px-2 text-lg"
                  value={column.nameEn}
                  maxLength={24}
                  disabled={!isOwner}
                  aria-label={`${t("boardNameEn")} ${index + 1}`}
                  onChange={(event) => edit((columns) => ((columns[index].nameEn = event.target.value), columns))}
                />
              </label>
              <label className="min-w-[7rem] flex-1">
                <span className="block font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("boardNameZh")}</span>
                <input
                  className="mt-1 min-h-11 w-full border border-rule bg-paper-raised px-2 font-zh text-lg"
                  value={column.nameZh}
                  maxLength={24}
                  disabled={!isOwner}
                  aria-label={`${t("boardNameZh")} ${index + 1}`}
                  onChange={(event) => edit((columns) => ((columns[index].nameZh = event.target.value), columns))}
                />
              </label>
              <label>
                <span className="block font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("boardRole")}</span>
                <select
                  className="mt-1 min-h-11 border border-rule bg-paper-raised px-2"
                  value={column.role}
                  disabled={!isOwner || rolesAt(index).length < 2}
                  aria-label={`${t("boardRole")} ${index + 1}`}
                  onChange={(event) => edit((columns) => ((columns[index].role = event.target.value as ColumnRole), columns))}
                >
                  {rolesAt(index).map((role) => (
                    <option key={role} value={role}>
                      {t(ROLE_WORD[role])}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="block font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{t("boardColour")}</span>
                <input
                  type="color"
                  className="mt-1 h-11 w-14 cursor-pointer border border-rule bg-paper-raised"
                  value={column.colour}
                  disabled={!isOwner}
                  aria-label={`${t("boardColour")} ${index + 1}`}
                  onChange={(event) => edit((columns) => ((columns[index].colour = event.target.value), columns))}
                />
              </label>
              {shownColour(column.colour, paper).strengthened ? (
                <p className="w-full text-sm text-ink-soft" data-testid={`board-strengthened-${index}`}>
                  {t("boardStrengthened")}
                </p>
              ) : null}
              {isOwner ? (
                <div className="flex gap-1">
                  <Button variant="line" className="px-3" aria-label={`${t("boardUp")} ${index + 1}`} disabled={!canMove(index, -1)} onClick={() => edit((columns) => ([columns[index - 1], columns[index]] = [columns[index], columns[index - 1]], columns))}>
                    ↑
                  </Button>
                  <Button variant="line" className="px-3" aria-label={`${t("boardDown")} ${index + 1}`} disabled={!canMove(index, 1)} onClick={() => edit((columns) => ([columns[index + 1], columns[index]] = [columns[index], columns[index + 1]], columns))}>
                    ↓
                  </Button>
                  <Button
                    variant="line"
                    className="px-3"
                    aria-label={`${t("boardRemove")} ${index + 1}`}
                    disabled={column.role === "incoming" || column.role === "completed" || (column.role === "ready" && board.columns.filter((c) => c.role === "ready").length === 1)}
                    onClick={() => edit((columns) => columns.filter((_, at) => at !== index))}
                  >
                    ✕
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        {isOwner ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="line" disabled={board.columns.length >= MAX_COLUMNS} onClick={addColumn}>
              {t("boardAdd")}
            </Button>
            <Button variant="accent" className="min-h-12 px-8" disabled={busy} onClick={() => save(false)}>
              {t("boardSave")}
            </Button>
            <Button variant="line" disabled={busy} onClick={reset} data-testid="board-reset">
              {confirmReset ? t("confirmTap") : t("boardReset")}
            </Button>
          </div>
        ) : null}
        {moving ? (
          <div className="mt-4 border-l-4 border-accent bg-accent/10 p-3" role="alert" data-testid="board-moves">
            <p>{t("boardMovesLede")}</p>
            <p className="mt-1 font-display">{moving}</p>
            <Button variant="accent" className="mt-3" disabled={busy} onClick={() => save(true)}>
              {t("boardSaveAndMove")}
            </Button>
          </div>
        ) : null}
        {message ? (
          <p className={`mt-4 border-l-2 pl-3 ${message.failed ? "border-accent text-accent-ink" : "border-[#2f7d4f]"}`} role={message.failed ? "alert" : "status"} data-testid="board-message">
            {message.text}
          </p>
        ) : null}
      </section>
      {children}
    </div>
  );
}
