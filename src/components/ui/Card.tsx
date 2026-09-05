import type { ComponentProps } from "react";

/** Figma の白カード（rounded-20 / 影ひかえめ） */
export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={["rounded-card bg-surface p-4 shadow-[0_8px_9px_rgba(0,0,0,0.04)]", className].join(" ")}
      {...props}
    />
  );
}
