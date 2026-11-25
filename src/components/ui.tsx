"use client";

import { useEffect, useId, useRef } from "react";
import { DanMark } from "./mark";

export function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="flex items-center gap-3">
        <DanMark size={44} />
        <p className="font-wordmark text-4xl leading-none">Dan</p>
      </div>
    </div>
  );
}

export function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase">{children}</p>;
}

export function PageTitle({
  kicker,
  title,
  gloss,
  className = "mb-6",
}: {
  kicker?: string;
  title: string;
  gloss?: string;
  className?: string;
}) {
  return (
    <header className={`border-b-[3px] border-ink pb-3 ${className}`}>
      {kicker ? <Kicker>{kicker}</Kicker> : null}
      <div className="mt-1 flex items-baseline gap-3">
        <h1 className="font-display text-4xl leading-none md:text-5xl">{title}</h1>
        {gloss ? <p className="font-zh text-lg text-accent-ink">{gloss}</p> : null}
      </div>
    </header>
  );
}

export function Button({
  variant = "ink",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "ink" | "accent" | "ghost" | "line" }) {
  const styles = {
    ink: "bg-ink text-paper hover:bg-ink/90 active:bg-ink/80",
    accent: "bg-accent text-on-accent hover:bg-accent-deep active:bg-accent-deep",
    ghost: "bg-transparent text-ink hover:bg-paper-deep active:bg-paper-deep",
    line: "border border-rule bg-paper-raised text-ink hover:bg-paper-deep active:bg-paper-deep",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 px-4 text-center font-display text-lg leading-none transition-transform duration-75 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${styles} ${className}`}
    />
  );
}

export function TextField({
  label,
  hint,
  error,
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const fieldId = id ?? props.name ?? "field";
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  return (
    <div>
      <label className="font-display text-[0.72rem] tracking-[0.18em] text-ink-soft uppercase" htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        aria-describedby={describedBy}
        {...props}
        className="mt-2 w-full min-h-12 border border-rule bg-paper-raised px-3 font-body text-lg text-ink outline-none placeholder:text-ink-soft/70"
      />
      {error ? (
        <p id={`${fieldId}-error`} className="mt-2 text-sm text-accent-ink" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mt-2 text-sm leading-relaxed text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Set when this component closes the dialog itself. The browser still fires
  // a "close" event for that, and it must not read as the person cancelling:
  // in development React mounts twice, and the first unmount's close used to
  // shut the dish editor the moment it opened.
  const closingQuietly = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const closeQuietly = () => {
      closingQuietly.current = true;
      el.close();
    };
    if (open && !el.open) el.showModal();
    if (!open && el.open) closeQuietly();
    return () => {
      if (el.open) closeQuietly();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onClose={() => {
        if (closingQuietly.current) {
          closingQuietly.current = false;
          return;
        }
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="border-b border-rule px-5 py-4">
        <h2 id={titleId} className="font-display text-3xl leading-none">
          {title}
        </h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </dialog>
  );
}
