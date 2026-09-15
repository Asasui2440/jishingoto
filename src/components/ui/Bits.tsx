import type { ComponentProps } from "react";
import { Furigana } from "./Furigana";

/** 小さい色つきラベル（「たおれるかも」など） */
export function Tag({
  children,
  color,
  soft,
  className = "",
  style,
  ...props
}: ComponentProps<"span"> & { color: string; soft?: string }) {
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded-[6px] px-2 py-0.5 font-display text-11 font-bold",
        className,
      ].join(" ")}
      style={{
        ...(soft ? { background: soft, color } : { background: color, color: "#fff" }),
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}

/** 進捗バー。`value` は 0–1。 */
export function Meter({
  value,
  color = "var(--color-primary-mid)",
  track = "var(--color-canvas)",
  height = 8,
  className = "",
}: {
  value: number;
  color?: string;
  track?: string;
  height?: number;
  className?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      className={["w-full overflow-hidden rounded-full", className].join(" ")}
      style={{ background: track, height }}
      role="presentation"
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

/** 画面上部の見出し（title-block） */
export function TitleBlock({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="shrink-0 px-6 pt-4">
      <h1 className="font-display text-xl font-bold text-ink">
        <Furigana text={title} />
      </h1>
      {lead ? (
        <p className="mt-1 text-13 text-ink-muted">
          <Furigana text={lead} />
        </p>
      ) : null}
    </div>
  );
}

/** 丸いアイコンチップ */
export function IconChip({
  bg,
  size = 36,
  className = "",
  ...props
}: ComponentProps<"span"> & { bg: string; size?: number }) {
  return (
    <span
      className={["inline-grid shrink-0 place-items-center rounded-full", className].join(" ")}
      style={{ background: bg, width: size, height: size }}
      {...props}
    />
  );
}
