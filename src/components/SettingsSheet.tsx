"use client";

import { useEffect, useId, useRef } from "react";
import { XCircleDarkIcon } from "@/components/icons";
import { useSettings, type UiScale } from "@/lib/settings";

const SCALES: { value: UiScale; label: string; sample: string }[] = [
  { value: "normal", label: "ふつう", sample: "16" },
  { value: "large", label: "大きい", sample: "18" },
  { value: "xlarge", label: "とても大きい", sample: "20" },
];

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="font-display text-15 font-bold text-ink">{label}</p>
        {hint ? <p className="mt-0.5 text-xs text-ink-soft">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        "relative h-8 w-14 shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-primary-ink" : "bg-border",
      ].join(" ")}
    >
      <span
        className={[
          "absolute top-1 size-6 rounded-full bg-white shadow-sm transition-[left] duration-200",
          checked ? "left-7" : "left-1",
        ].join(" ")}
      />
    </button>
  );
}

/**
 * ふりがな・文字サイズ・音などの設定。
 * 「年齢層に応じて UI を変える」は、まず文字サイズとふりがなから入れている。
 */
export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const titleId = useId();
  const settings = useSettings();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="とじる"
        onClick={onClose}
        className="animate-fade absolute inset-0 bg-ink/45"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="animate-rise relative w-full max-w-[402px] rounded-t-[28px] bg-surface px-6 pt-5 outline-none"
      >
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="font-display text-lg font-bold text-ink">
            ひょうじの設定
          </h2>
          <button type="button" onClick={onClose} aria-label="とじる" className="p-1">
            <XCircleDarkIcon className="size-6" />
          </button>
        </div>

        <div className="divide-y divide-border">
          <Row label="ふりがな" hint="漢字に読みがなをつける">
            <Toggle
              label="ふりがな"
              checked={settings.furigana}
              onChange={(v) => settings.update({ furigana: v })}
            />
          </Row>

          <div className="py-3">
            <p className="font-display text-15 font-bold text-ink">文字の大きさ</p>
            <div className="mt-2 flex gap-2" role="radiogroup" aria-label="文字の大きさ">
              {SCALES.map((s) => {
                const active = settings.uiScale === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => settings.update({ uiScale: s.value })}
                    className={[
                      "flex-1 rounded-tile border-2 py-2.5 font-display font-bold transition-colors",
                      active
                        ? "border-primary-mid bg-primary-soft text-primary-ink"
                        : "border-border bg-surface text-ink-soft",
                    ].join(" ")}
                  >
                    <span style={{ fontSize: `${s.sample}px` }}>あ</span>
                    <span className="mt-0.5 block text-11">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Row label="音・振動" hint="地震の効果音とバイブレーション">
            <Toggle
              label="音・振動"
              checked={settings.sound}
              onChange={(v) => settings.update({ sound: v, haptics: v })}
            />
          </Row>
        </div>

        <p className="safe-bottom pt-4 text-center text-11 text-ink-faint">
          設定はこの端末にだけ保存されます
        </p>
      </div>
    </div>
  );
}
