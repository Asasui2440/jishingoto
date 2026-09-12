import type { Question } from "./content";

type ReviewIllustration = { image: string; alt: string; headline: string; timing: string };
const SCENES: Record<string, ReviewIllustration> = {
  shelter: { image: "shelter-v4", alt: "丈夫な机の下で頭を守り、机の脚を持つ人", headline: "丈夫[じょうぶ]で安全[あんぜん]に入[はい]れる机[つくえ]なら下[した]へ。無理[むり]なら頭[あたま]と首[くび]を守[まも]る", timing: "揺れている間" },
  cover: { image: "protect-head", alt: "家具や窓から距離をとり、低い姿勢で頭と首を守る人", headline: "まず頭[あたま]と首[くび]を守[まも]ろう", timing: "揺れている間" },
  fire: { image: "protect-head", alt: "火を消しに走らず、低い姿勢で頭を守る行動の例", headline: "火[ひ]を消[け]しに走[はし]らず、まず頭[あたま]を守[まも]る", timing: "揺れている間／火の始末は収まってから安全を確認" },
  exit: { image: "safe-exit-v5", alt: "安全な場所にとどまり、明かりで足元と通れる道を確認する人", headline: "まず足元[あしもと]を見[み]て、安全[あんぜん]な道[みち]を探[さが]そう", timing: "揺れが収まったあと" },
  information: { image: "check-information-v6", alt: "安全な場所で親子がスマートフォンの情報を確認する様子", headline: "発信元[はっしんもと]・日時・場所を確[たし]かめよう", timing: "揺れが収まり、安全な場所で" },
};

/** 選んだ（危険かもしれない）行動ではなく、設問で推奨する行動を描く。 */
export function reviewIllustration(question: Question): ReviewIllustration | null {
  const best = question.choices.reduce<typeof question.choices[number] | undefined>((best, choice) => !best || choice.safety > best.safety ? choice : best, undefined);
  if (!best) return null;
  switch (best.id) {
    case "under-desk": return SCENES.shelter;
    case "cover": case "move-away": case "protect-head": return { ...SCENES.shelter, headline: "近くに丈夫[じょうぶ]な机があり、安全に入れる場合は下へ。難[むずか]しい場合はその場で頭と首を守る" };
    case "curtain": return { ...SCENES.cover, image: "window-distance-v4" };
    case "wait": return { ...SCENES.fire, image: "kitchen-cover-v4" };
    case "shoes": case "clear-exit": return SCENES.exit;
    case "verify": return SCENES.information;
    default: {
      const image = SCENARIO_IMAGES[best.id];
      return image ? { image: `${image}-${image === "shelter-damaged" ? "v5" : "v4"}`, alt: best.label.replace(/\[[^\]]*\]/g, ""), headline: best.label, timing: question.phase === "during" ? "揺れている間" : "揺れが収まったあと" } : null;
    }
  }
}

const SCENARIO_IMAGES: Record<string, string> = Object.fromEntries([
  "shelter-damaged", "shelter-home", "shelter-tsunami", "home-bed",
  "classroom-desk", "classroom-exit", "classroom-reunion",
  "office-copier", "office-elevator", "office-stay",
].map((id) => [`${id}-0`, id]));

/** 新しいイラストはPNG、既存素材はWebP。 */
export function reviewImagePath(image: string): string {
  return `/illustrations/review/${image}.${/-v[56]$/.test(image) ? "png" : "webp"}`;
}
