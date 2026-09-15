import type { Choice, Question } from "./content";

export type ChoiceIllustration = { sheet: string; slot: 0 | 1 | 2 | 3 };
const art = (sheet: string, slot: ChoiceIllustration["slot"]): ChoiceIllustration => ({ sheet, slot });

/** 4コマの固定素材。設問・選択肢の順序ではなく行動に対応させる。 */
const ADULT_SHEETS: Record<string, string> = {
  "under-desk": "desk", "move-away": "movement", cover: "movement", curtain: "movement",
  "protect-head": "alert", "clear-exit": "floor", shoes: "floor", "kitchen-check": "kitchen",
  "open-exit": "exit", "check-family": "family", "shelter-home-0": "home",
  "shelter-damaged-0": "damaged", verify: "information",
};

const CHILD_ART: Record<string, ChoiceIllustration> = {
  "protect-head": art("basic", 0), "run-immediately": art("basic", 1), "stand-and-watch": art("basic", 2),
  "move-away": art("movement", 0), "hold-object": art("basic", 3), "run-out": art("basic", 1),
  "under-desk": art("desk", 0), "beside-desk": art("obstacles", 1), "door-desk": art("basic", 1),
  curtain: art("movement", 0), open: art("obstacles", 2), close: art("obstacles", 3),
  "clear-exit": art("floor", 0), "climb-over": art("obstacles", 0), "wait-only": art("exit", 3),
  "kitchen-check": art("kitchen", 0), "kitchen-rush": art("kitchen", 1), "kitchen-ignore": art("kitchen", 2),
  "open-exit": art("exit", 0), "rush-through-exit": art("exit", 2), "ignore-exit": art("exit", 3),
  "check-family": art("family", 0), "run-to-family": art("basic", 1), "assume-family": art("exit", 3),
  "shelter-home-0": art("home", 0), "shelter-home-1": art("home", 1), "shelter-home-2": art("home", 3),
  "shelter-damaged-0": art("damaged", 0), "shelter-damaged-1": art("damaged", 3), "shelter-damaged-2": art("damaged", 2),
  verify: art("information", 0), share: art("information", 2), panic: art("basic", 1),
};

export function choiceIllustration(question: Question, choice: Choice): ChoiceIllustration | undefined {
  if (!question.challenge) return CHILD_ART[choice.id];
  const best = question.choices.reduce((a, b) => b.safety > a.safety ? b : a);
  const sheet = ADULT_SHEETS[best.id];
  if (!sheet) return undefined;
  const slot = choice.id === best.id ? 0 : Number(choice.id.match(/-adult-([1-3])$/)?.[1]);
  return Number.isInteger(slot) && slot >= 0 && slot <= 3 ? art(sheet, slot as ChoiceIllustration["slot"]) : undefined;
}

export function choiceIllustrationPath(illustration: ChoiceIllustration): string {
  return `/illustrations/quiz/${illustration.sheet}.webp`;
}
