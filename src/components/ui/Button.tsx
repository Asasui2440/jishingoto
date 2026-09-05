import type { ComponentProps } from "react";

type Variant = "primary" | "outline" | "quiet" | "line" | "x";

/** Figma の button（h-56 / rounded-28）に対応するバリアント */
const VARIANTS: Record<Variant, string> = {
  // 黄の上は白ではなく濃い文字。白だとコントラスト比 1.5:1 で読めない
  primary: "bg-primary text-ink shadow-[0_4px_6px_rgba(184,125,0,0.3)] active:bg-[#f0c000]",
  outline: "bg-surface text-primary-ink border-2 border-primary-mid active:bg-primary-soft",
  quiet: "bg-canvas text-primary-ink active:bg-primary-soft",
  line: "bg-line text-white active:brightness-95",
  x: "bg-black text-white active:bg-[#222]",
};

const SIZES = {
  lg: "h-14 px-6 text-lg rounded-pill",
  md: "h-12 px-4 text-15 rounded-[24px]",
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
