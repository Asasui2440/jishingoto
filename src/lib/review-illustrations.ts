import type { Question } from "./content";

type ReviewIllustration = { image: string; alt: string; headline: string; timing: string };
const SCENES: Record<string, ReviewIllustration> = {
  shelter: { image: "shelter", alt: "丈夫な机の下で頭を守り、机の脚を持つ人", headline: "机[つくえ]の下[した]で頭[あたま]を守[まも]り、脚[あし]を持[も]つ", timing: "揺れている間" },
  cover: { image: "protect-head", alt: "家具や窓から距離をとり、低い姿勢で頭と首を守る人", headline: "危[あぶ]ない物[もの]から離[はな]れ、低[ひく]くなって頭[あたま]を守[まも]る", timing: "揺れている間" },
  fire: { image: "protect-head", alt: "火を消しに走らず、低い姿勢で頭を守る行動の例", headline: "火[ひ]を消[け]しに走[はし]らず、まず頭[あたま]を守[まも]る", timing: "揺れている間／火の始末は収まってから安全を確認" },
  exit: { image: "safe-exit", alt: "靴を履いて懐中電灯を持ち、出口へ通れる床を確認する人", headline: "足[あし]を守[まも]り、ドアまでの道[みち]と扉[とびら]を確認[かくにん]", timing: "揺れが収まったあと" },
  information: { image: "check-information", alt: "落ち着いてスマートフォンで気象庁や自治体の情報を確認する人", headline: "すぐ広[ひろ]めず、公的[こうてき]な情報[じょうほう]を確認[かくにん]", timing: "揺れが収まり、安全な場所で" },
};

/** 選んだ（危険かもしれない）行動ではなく、設問で推奨する行動を描く。 */
export function reviewIllustration(question: Question): ReviewIllustration | null {
  const best = question.choices.reduce<typeof question.choices[number] | undefined>((best, choice) => !best || choice.safety > best.safety ? choice : best, undefined);
  if (!best) return null;
  if (question.id === "q2" && best.id === "wait") return SCENES.fire;
  switch (best.id) {
    case "under-desk": return SCENES.shelter;
    case "cover": case "move-away": case "curtain": return SCENES.cover;
    case "shoes": case "clear-exit": return SCENES.exit;
    case "verify": return SCENES.information;
    default: return null;
  }
}
