import type { ComponentProps } from "react";

/** 元の角丸を保った、細い枠の白いカード。 */
export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={["rounded-card border border-border bg-surface p-4", className].join(" ")}
      {...props}
    />
  );
}
