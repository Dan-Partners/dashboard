"use client";

import { FEATURES } from "@/lib/features";
import { useState } from "react";
import { useI18n, type CopyKey } from "@/lib/i18n";
import {
  CHROME_MODES,
  DEFAULT_THEME,
  PRESET_IDS,
  PRESETS,
  TYPEFACE_IDS,
  TYPEFACES,
  isHex,
  resolveTheme,
  specOf,
  type ChromeMode,
  type PresetId,
  type ThemeSpec,
} from "@/lib/theme";
import { useShop } from "@/lib/shop-context";
import { useTheme, type ThemeSave } from "@/lib/use-theme";
import { Button, Dialog, Kicker } from "./ui";

const PRESET_COPY: Record<PresetId | "custom", { name: CopyKey; gloss: CopyKey }> = {
  dan: { name: "presetDan", gloss: "presetDanZh" },
  seal: { name: "presetSeal", gloss: "presetSealZh" },
  ink: { name: "presetInk", gloss: "presetInkZh" },
  jade: { name: "presetJade", gloss: "presetJadeZh" },
  porcelain: { name: "presetPorcelain", gloss: "presetPorcelainZh" },
  contrast: { name: "presetContrast", gloss: "presetContrastZh" },
  custom: { name: "presetCustom", gloss: "presetCustomZh" },
};

const CHROME_COPY: Record<ChromeMode, CopyKey> = {
  paper: "themeChromePaper",
  accent: "themeChromeAccent",
  ink: "themeChromeInk",
};

/**
 * Choose a theme, or customise one. Every change applies and saves at once,
 * so the counter behind the dialog is the preview.
 */
export function ThemeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { theme, setTheme, canEdit, save } = useTheme();
  const { persisted } = useShop();
  const demo = persisted.session?.mode === "demo";
  const [view, setView] = useState<"choose" | "customise">("choose");

  function close() {
    setView("choose");
    onClose();
  }

  return (
    <Dialog open={open} title={t(view === "choose" ? "themeTitle" : "themeCustomiseTitle")} onClose={close}>
      {view === "choose" ? (
        <div data-testid="theme-choose">
          <p className="text-ink-soft">{t("themeLede")}</p>
          {!canEdit ? (
            <p className="mt-3 border-l-2 border-accent pl-3 text-sm" data-testid="theme-owner-only">
              {t("themeOwnerOnly")}
            </p>
          ) : null}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[...PRESET_IDS, "custom" as const].map((id) => (
              <PresetTile
                key={id}
                spec={id === "custom" ? theme.custom : PRESETS[id]}
                name={t(PRESET_COPY[id].name)}
                gloss={t(PRESET_COPY[id].gloss)}
                selected={theme.preset === id}
                testId={`theme-${id}`}
                disabled={!canEdit}
                onSelect={() => setTheme({ ...theme, preset: id })}
              />
            ))}
          </div>
          <div className="mt-5">
            <Kicker>{t("themeTypeface")}</Kicker>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5" role="group" aria-label={t("themeTypeface")}>
              {TYPEFACE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={theme.typeface === id}
                  data-testid={`typeface-${id}`}
                  disabled={!canEdit}
                  onClick={() => setTheme({ ...theme, typeface: id })}
                  // Each option is drawn in its own typeface.
                  style={{ fontFamily: TYPEFACES[id].sample, fontWeight: TYPEFACES[id].weight }}
                  className={`min-h-16 border px-1 py-2 text-center disabled:cursor-default ${canEdit ? "cursor-pointer" : ""} ${theme.typeface === id ? "border-ink bg-ink text-paper" : `border-rule ${canEdit ? "hover:bg-paper-deep" : ""}`}`}
                >
                  <span className="block text-2xl leading-none">Aa</span>
                  <span className="mt-1.5 block text-xs leading-tight">{TYPEFACES[id].name}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="mt-4 text-sm text-ink-soft">{t(demo ? "themeDemoNote" : "themeDeviceNote")}</p>
          <SaveStatus save={save} />
          <div className="mt-5 flex gap-2">
            {canEdit ? (
              <Button variant="line" className="flex-1" onClick={() => setView("customise")}>
                {t("themeCustomise")}
              </Button>
            ) : null}
            <Button className="flex-1" onClick={close}>
              {t("themeDone")}
            </Button>
          </div>
        </div>
      ) : (
        // Customising starts from the theme on screen. It becomes "Custom" at the first change.
        <Customise
          spec={specOf(theme)}
          onChange={(custom) => setTheme({ ...theme, preset: "custom", custom })}
          onReset={() => {
            // Colours go back to Dan. The typeface is a separate choice and stays.
            setTheme({ ...DEFAULT_THEME, typeface: theme.typeface });
            setView("choose");
          }}
          onBack={() => setView("choose")}
          onDone={close}
        />
      )}
    </Dialog>
  );
}

/** Opens the theme dialog. The three squares are the theme's paper, ink and accent. */
export function ThemeButton({
  label,
  gloss,
  onClick,
  className = "w-full",
}: {
  label: string;
  gloss: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-testid="theme-button"
      className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 border border-rule bg-paper-raised px-3 text-ink hover:bg-paper-deep ${className}`}
      onClick={onClick}
    >
      <span className="flex items-baseline gap-2">
        <span className="font-display text-lg leading-none">{label}</span>
        <span className="font-zh text-xs text-ink-soft">{gloss}</span>
      </span>
      <span className="flex gap-1" aria-hidden>
        <span className="size-3 border border-rule bg-paper" />
        <span className="size-3 bg-ink" />
        <span className="size-3 bg-accent" />
      </span>
    </button>
  );
}

/** Says when the shop's theme is being saved, or could not be. */
function SaveStatus({ save }: { save: ThemeSave }) {
  const { t } = useI18n();
  if (save.failed) {
    return (
      <p className="mt-2 text-sm text-accent-ink" role="alert" data-testid="theme-save-failed">
        {t("themeSaveFailed")}
      </p>
    );
  }
  return (
    <p className="mt-2 min-h-5 text-sm text-ink-soft" aria-live="polite" data-testid="theme-save-status">
      {save.saving ? t("themeSaving") : ""}
    </p>
  );
}

function PresetTile({
  spec,
  name,
  gloss,
  selected,
  testId,
  disabled = false,
  onSelect,
}: {
  spec: ThemeSpec;
  name: string;
  gloss: string;
  selected: boolean;
  testId: string;
  disabled?: boolean;
  onSelect: () => void;
}) {
  // A tile shows another theme's colours, so it paints from data, not from the roles.
  const { page, chrome } = resolveTheme(spec);
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-testid={testId}
      disabled={disabled}
      onClick={onSelect}
      className={`border p-1.5 text-left ${disabled ? "cursor-default" : "cursor-pointer"} ${selected ? "border-ink bg-paper-raised outline-2 outline-ink" : `border-rule ${disabled ? "" : "hover:bg-paper-deep"}`}`}
    >
      <span className="flex h-16 overflow-hidden" style={{ background: page.paper, boxShadow: `inset 0 0 0 1px ${page.rule}` }} aria-hidden>
        <span className="flex w-1/4 flex-col gap-1 p-1.5" style={{ background: chrome.paper, boxShadow: `inset -1px 0 0 ${chrome.rule}` }}>
          <span className="size-3 bg-seal" />
          <span className="mt-1 h-1" style={{ background: chrome.ink }} />
          <span className="h-1 w-2/3" style={{ background: chrome["ink-soft"] }} />
        </span>
        <span className="flex flex-1 flex-col gap-1 p-1.5">
          <span className="h-1.5 w-3/5" style={{ background: page.ink }} />
          <span className="h-1 w-4/5" style={{ background: page["ink-soft"] }} />
          <span className="mt-auto flex items-end justify-between">
            <span className="h-3.5 w-9" style={{ background: page.accent }} />
            <span className="h-3.5 w-5" style={{ background: page["paper-raised"], boxShadow: `inset 0 0 0 1px ${page.rule}` }} />
          </span>
        </span>
      </span>
      <span className="mt-1.5 flex items-baseline justify-between gap-2 px-0.5">
        <span className="font-display text-lg leading-tight">{name}</span>
        <span className="font-zh text-sm whitespace-nowrap text-ink-soft">{gloss}</span>
      </span>
    </button>
  );
}

function Customise({
  spec,
  onChange,
  onReset,
  onBack,
  onDone,
}: {
  spec: ThemeSpec;
  onChange: (spec: ThemeSpec) => void;
  onReset: () => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { adjusted } = resolveTheme(spec);
  const { save } = useTheme();

  return (
    <div data-testid="theme-customise">
      <p className="text-ink-soft">{t("themeCustomiseLede")}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <ColourField label={t("themePaper")} name="paper" value={spec.paper} onChange={(paper) => onChange({ ...spec, paper })} />
        <ColourField label={t("themeInk")} name="ink" value={spec.ink} onChange={(ink) => onChange({ ...spec, ink })} />
        <ColourField label={t("themeAccent")} name="accent" value={spec.accent} onChange={(accent) => onChange({ ...spec, accent })} />
      </div>
      <SaveStatus save={save} />
      {adjusted.ink || adjusted.accent ? (
        <div className="mt-3 space-y-1 border-l-2 border-accent pl-3 text-sm" role="status" data-testid="theme-adjusted">
          {adjusted.ink ? <p>{t("themeAdjustedInk")}</p> : null}
          {adjusted.accent ? <p>{t("themeAdjustedAccent")}</p> : null}
        </div>
      ) : null}

      <div className="mt-5">
        <Kicker>{t("themeChrome")}</Kicker>
        <div className="mt-2 grid grid-cols-3 border border-rule" role="group" aria-label={t("themeChrome")}>
          {CHROME_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={spec.chrome === mode}
              data-testid={`theme-chrome-${mode}`}
              className={`min-h-11 cursor-pointer font-display ${spec.chrome === mode ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper-deep"}`}
              onClick={() => onChange({ ...spec, chrome: mode })}
            >
              {t(CHROME_COPY[mode])}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <Kicker>{t("themePreview")}</Kicker>
        <Sample />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={onBack}>
          {t("themeBack")}
        </Button>
        <Button variant="line" onClick={onReset}>
          {t("themeReset")}
        </Button>
        <Button className="flex-1" onClick={onDone}>
          {t("themeDone")}
        </Button>
      </div>
    </div>
  );
}

/** A docket in miniature, painted with the live roles. */
function Sample() {
  const { t } = useI18n();
  return (
    <div className="mt-2 flex" aria-hidden>
      <div className="chrome flex w-24 flex-col gap-1 border border-r-0 border-rule bg-paper p-2 text-ink">
        <span className="size-4 bg-seal" />
        <span className="mt-1 bg-ink px-1.5 py-0.5 font-display text-sm leading-tight text-paper">{t("navOrders")}</span>
        <span className="px-1.5 font-display text-sm leading-tight text-ink-soft">{t("navTill")}</span>
      </div>
      <div className="flex-1 border border-rule bg-paper-raised p-3">
        <p className="flex items-baseline justify-between">
          <span className="font-display text-xl leading-none">#1856</span>
          <span className="text-sm text-ink-soft">4m</span>
        </p>
        <p className="mt-2 flex gap-2 text-sm">
          <span className="font-display text-accent-ink">81</span>
          <span className="flex-1">
            Egg fried rice <span className="font-zh text-ink-soft">蛋炒飯</span>
          </span>
          <span>×2</span>
        </p>
        <p className="mt-2 flex items-center gap-2">
          <span className="bg-accent px-3 py-1.5 font-display leading-none text-on-accent">{t("accept")}</span>
          {FEATURES.stamps ? <span className="border border-rule px-3 py-1.5 font-display leading-none">{t("stampThis")}</span> : null}
          <span className="ml-auto font-display text-lg">£7.80</span>
        </p>
      </div>
    </div>
  );
}

function ColourField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const { t } = useI18n();
  // What is typed may be half a colour. Only a whole one is passed on.
  const [typed, setTyped] = useState<string | null>(null);
  const invalid = typed !== null && !isHex(normaliseTyped(typed));
  const id = `theme-${name}`;

  return (
    <div>
      <label htmlFor={id} className="font-display text-[0.72rem] tracking-[0.16em] text-ink-soft uppercase">
        {label}
      </label>
      <div className="mt-1 flex border border-rule bg-paper-raised">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(event) => {
            setTyped(null);
            onChange(event.target.value.toLowerCase());
          }}
          className="h-11 w-12 shrink-0 cursor-pointer border-0 border-r border-rule bg-transparent p-1"
        />
        <input
          id={id}
          data-testid={id}
          value={typed ?? value}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          maxLength={7}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          onChange={(event) => {
            const next = event.target.value;
            setTyped(next);
            const hex = normaliseTyped(next);
            if (isHex(hex)) onChange(hex);
          }}
          onBlur={() => setTyped(null)}
          className="min-h-11 w-full min-w-0 bg-transparent px-2 font-ticket text-sm uppercase outline-none"
        />
      </div>
      {invalid ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-accent-ink" role="alert">
          {t("themeHexInvalid")}
        </p>
      ) : null}
    </div>
  );
}

function normaliseTyped(value: string) {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}
