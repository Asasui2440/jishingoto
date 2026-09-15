import { choiceIllustrationPath, type ChoiceIllustration } from "@/lib/choice-illustrations";

/** 文章が行動を説明するため、絵は読み上げず補助として添える。 */
export function ChoiceArtwork({ illustration, number }: { illustration: ChoiceIllustration; number: number }) {
  return <span aria-hidden="true" className="relative block size-14 shrink-0">
    <span
      data-choice-art={`${illustration.sheet}:${illustration.slot}`}
      className="block size-14 rounded-lg bg-white bg-no-repeat"
      style={{
        backgroundImage: `url("${choiceIllustrationPath(illustration)}")`,
        backgroundSize: "200% 200%",
        backgroundPosition: `${illustration.slot % 2 ? 100 : 0}% ${illustration.slot >= 2 ? 100 : 0}%`,
      }}
    />
    <span className="absolute -top-1 -left-1 grid size-5 place-items-center rounded-full bg-primary-soft font-display text-11 font-bold text-primary-ink">{number}</span>
  </span>;
}
