import type { ComponentProps } from "react";

type Variant = "primary" | "outline" | "quiet" | "line" | "x";

/** 黄色と丸みは元のデザインを維持し、影を使わず操作の優先度を分ける。 */
const VARIANTS: Record<Variant, string> = {
  // 黄の上は白ではなく濃い文字。白だとコントラスト比 1.5:1 で読めない
  primary: "bg-primary text-ink hover:brightness-[0.97] active:bg-[#efc43c]",
  outline: "bg-surface text-ink border border-[#a8b8c3] active:bg-glass-soft",
  quiet: "bg-canvas text-primary-ink active:bg-primary-soft",
  line: "bg-line text-white active:brightness-95",
  x: "bg-black text-white active:bg-[#222]",
};

const SIZES = {
  sm: "min-h-10 px-2 py-1.5 text-sm rounded-pill",
  lg: "min-h-14 px-6 py-3 text-lg rounded-pill",
  md: "min-h-12 px-4 py-2 text-15 rounded-[24px]",
} as const;

export function Button({
  variant = "primary",
  size = "lg",
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof SIZES }) {
  return (
    <button
      type={type}
      className={[
        "inline-flex w-full items-center justify-center gap-2 font-display font-bold",
        "transition-[filter,background-color,transform] duration-100 active:scale-[0.99]",
        "disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(" ")}
      {...props}
    />
  );
}
