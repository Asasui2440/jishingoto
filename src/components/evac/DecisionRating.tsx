import type { EvacChoice, HazardEvent } from "@/lib/evac-content";

export function decisionRating(event: HazardEvent, choice: EvacChoice) {
  const priorities = event.choices.map(item => item.priority);
  if (!priorities.length || !priorities.every(value => Number.isInteger(value) && value >= 1 && value <= 3)) return { symbol: "—", label: "評価なし", color: "bg-canvas text-ink-muted border-border" };
  if (choice.priority === Math.max(...priorities)) return { symbol: "○", label: "良い判断", color: "bg-teal-100 text-teal-900 border-teal-400" };
  if (choice.priority > 1) return { symbol: "△", label: "もう一工夫", color: "bg-amber-100 text-amber-900 border-amber-400" };
  return { symbol: "×", label: "見直したい判断", color: "bg-rose-100 text-rose-900 border-rose-400" };
}

export function DecisionRating({ event, choice, compact = false }: { event: HazardEvent; choice: EvacChoice; compact?: boolean }) {
  const rating = decisionRating(event, choice);
  return <span aria-label={rating.label} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-2 py-1 font-bold ${rating.color}`}><svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">{rating.symbol === "○" ? <circle cx="12" cy="12" r="9" /> : rating.symbol === "△" ? <path d="M12 3 21 20H3Z" /> : rating.symbol === "×" ? <path d="m4 4 16 16M4 20 20 4" /> : <path d="M4 12h16" />}</svg><span className="sr-only">{rating.symbol}</span>{!compact ? <span className="text-13">{rating.label}</span> : null}</span>;
}
