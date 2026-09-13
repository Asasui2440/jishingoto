import type { Question } from "./content";

type ReviewIllustration = { image: string; alt: string; headline: string; timing: string };
const SCENES: Record<string, ReviewIllustration> = {
  shelter: { image: "desk-hold-v12", alt: "机の下で膝をついて低くなり、左右の手で別々の机の脚をつかむ小学校高学年の子", headline: "丈夫[じょうぶ]で安全[あんぜん]に入[はい]れる机[つくえ]なら下[した]へ。無理[むり]なら頭[あたま]と首[くび]を守[まも]る", timing: "揺れている間" },
  cover: { image: "protect-head", alt: "家具や窓から距離をとり、低い姿勢で頭と首を守る人", headline: "まず頭[あたま]と首[くび]を守[まも]ろう", timing: "揺れている間" },
  fire: { image: "protect-head", alt: "火を消しに走らず、低い姿勢で頭を守る行動の例", headline: "火[ひ]を消[け]しに走[はし]らず、まず頭[あたま]を守[まも]る", timing: "揺れている間／火の始末は収まってから安全を確認" },
  exit: { image: "check-floor-v18", alt: "ガラス片や物が散乱した床と、出口までの経路", headline: "まず足元[あしもと]を見[み]て、安全[あんぜん]な道[みち]を探[さが]そう", timing: "揺れが収まったあと" },
  information: { image: "information-tv-v11", alt: "安全な場所で親子がテレビのニュースを確認する様子", headline: "発信元[はっしんもと]・日時・場所を確[たし]かめよう", timing: "揺れが収まり、安全な場所で" },
};

/** 選んだ（危険かもしれない）行動ではなく、設問で推奨する行動を描く。 */
export function reviewIllustration(question: Question): ReviewIllustration | null {
  const best = question.choices.reduce<typeof question.choices[number] | undefined>((best, choice) => !best || choice.safety > best.safety ? choice : best, undefined);
  if (!best) return null;
  switch (best.id) {
    case "under-desk": return SCENES.shelter;
    case "cover": case "move-away": case "protect-head": return { ...SCENES.shelter, headline: "近くに丈夫[じょうぶ]な机があり、安全に入れる場合は下へ。難[むずか]しい場合はその場で頭と首を守る" };
    case "curtain": return { ...SCENES.shelter, headline: "窓から離れ、すぐ近くに安全に入れる丈夫な机があれば下へ。難しい場合はその場で頭と首を守る" };
    case "wait": return { ...SCENES.shelter, headline: "火を消しに走らず、まず身を守る。安全に入れる丈夫な机がすぐ近くにあれば下へ" };
    case "kitchen-check": return { image: "kitchen-question-v8", alt: "コンロと周囲を確認するキッチンの想定イラスト", headline: "揺れが収まってから、足元と周囲を確認。火の始末は安全に近づける場合だけ", timing: "揺れが収まったあと" };
    case "shoes": case "clear-exit": return SCENES.exit;
    case "verify": return SCENES.information;
    default: {
      const image = SCENARIO_IMAGES[best.id];
      return image ? { image: image === "shelter-damaged" ? "evacuation-open-v11" : `${image}-v4`, alt: best.label.replace(/\[[^\]]*\]/g, ""), headline: best.label, timing: question.phase === "during" ? "揺れている間" : "揺れが収まったあと" } : null;
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
  if (image === "kitchen-question-v8") return "/illustrations/actions/kitchen-question-v8.png";
  return `/illustrations/review/${image}.${/-v(?:5|6|11|12|13|14|15|16|18)$/.test(image) ? "png" : "webp"}`;
}
