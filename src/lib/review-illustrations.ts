import type { Question } from "./content";

type ReviewIllustration = { image: string; alt: string; headline: string; timing: string; secondary?: { image: string; alt: string; headline: string } };
const SCENES: Record<string, ReviewIllustration> = {
  shelter: { image: "desk-hold-v12", alt: "机の下で膝をついて低くなり、左右の手で別々の机の脚をつかむ小学校高学年の子", headline: "丈夫[じょうぶ]で安全[あんぜん]に入[はい]れる机[つくえ]なら下[した]へ。無理[むり]なら頭[あたま]と首[くび]を守[まも]る", timing: "揺れている間" },
  cover: { image: "protect-head", alt: "家具や窓から距離をとり、低い姿勢で頭と首を守る人", headline: "まず頭[あたま]と首[くび]を守[まも]ろう", timing: "揺れている間" },
  fire: { image: "protect-head", alt: "火を消しに走らず、低い姿勢で頭を守る行動の例", headline: "火[ひ]を消[け]しに走[はし]らず、まず頭[あたま]を守[まも]る", timing: "揺れている間／火の始末は収まってから安全を確認" },
  exit: { image: "floor-protection-v19", alt: "破片のない場所に座り、手元にあった丈夫な靴を履く子。周囲の床にはガラスや物が散乱している", headline: "破片を踏まずに通れる道を確かめよう。安全に動けなければ助けを呼ぼう", timing: "揺れが収まったあと" },
  information: { image: "information-tv-v11", alt: "安全な場所で親子がテレビのニュースを確認する様子", headline: "発信元[はっしんもと]・日時・場所を確[たし]かめよう", timing: "揺れが収まり、安全な場所で" },
};

/** 選んだ（危険かもしれない）行動ではなく、設問で推奨する行動を描く。 */
export function reviewIllustration(question: Question): ReviewIllustration | null {
  const best = question.choices.reduce<typeof question.choices[number] | undefined>((best, choice) => !best || choice.safety > best.safety ? choice : best, undefined);
  if (!best) return null;
  switch (best.id) {
    case "open-exit": return { image: "open-exit-v22", alt: "揺れが収まったあと、足元を確かめて室内から玄関のドアを開ける子", headline: "足元と周りを確かめてからドアを開け、出口を確かめよう", timing: "揺れが収まったあと" };
    case "check-family": return { image: "family-check-v22", alt: "通れる場所から父親に声をかけ、返事を確かめる子", headline: "自分の安全を確かめたら、家族に声をかけて様子を確かめよう", timing: "揺れが収まったあと" };
    case "shelter-damaged-0": return { image: "damaged-exit-v22", alt: "傾いた家から離れ、開けた場所に向かう親子", headline: "建物が倒れるおそれがある時は、避難所が開くのを待たずに離れよう", timing: "揺れが収まったあと" };
    case "under-desk": return SCENES.shelter;
    case "cover": case "move-away": case "protect-head": return { ...SCENES.shelter, headline: "近くに丈夫[じょうぶ]な机があり、安全に入れる場合は下へ。難[むずか]しい場合はその場で頭と首を守る" };
    case "curtain": return { ...SCENES.shelter, headline: "窓から離れ、すぐ近くに安全に入れる丈夫な机があれば下へ。難しい場合はその場で頭と首を守る" };
    case "wait": return { ...SCENES.shelter, headline: "火を消しに走らず、まず身を守る。安全に入れる丈夫な机がすぐ近くにあれば下へ" };
    case "kitchen-check": return {
      image: "cooktop-off-v20",
      alt: "物が散乱した台所で、足元と周囲の安全を確かめながらコンロの火を消す大人",
      headline: "① コンロの火を止める",
      timing: "揺れが収まったあと・安全に近づける場合だけ",
      secondary: { image: "gas-shutoff-v21", alt: "物が散乱した台所で安全を確かめ、コンロとは別のガスの元栓を閉める大人", headline: "② ガスの元栓を閉める" },
    };
    case "shelter-tsunami-0": return { image: "coast-evacuate-v20", alt: "防災用のバッグを持ち、違う姿勢で海から高台へ急いで避難する親子", headline: "海の近くで強い揺れや長い揺れを感じたら、津波警報を待たず高い場所へ", timing: "揺れが収まったあと・海の近く" };
    case "shoes": case "clear-exit": return SCENES.exit;
    case "verify": return SCENES.information;
    default: {
      const image = SCENARIO_IMAGES[best.id];
      return image ? { image: `${image}-v4`, alt: best.label.replace(/\[[^\]]*\]/g, ""), headline: best.label, timing: question.phase === "during" ? "揺れている間" : "揺れが収まったあと" } : null;
    }
  }
}

const SCENARIO_IMAGES: Record<string, string> = Object.fromEntries([
  "shelter-home", "shelter-tsunami", "home-bed",
  "classroom-desk", "classroom-exit", "classroom-reunion",
  "office-copier", "office-elevator", "office-stay",
].map((id) => [`${id}-0`, id]));

/** 新しいイラストはPNG、既存素材はWebP。 */
export function reviewImagePath(image: string): string {
  if (/-v(?:19|20|21|22)$/.test(image)) return `/illustrations/actions/${image}.png`;
  if (image === "kitchen-question-v8") return "/illustrations/actions/kitchen-question-v8.png";
  return `/illustrations/review/${image}.${/-v(?:5|6|11|12|13|14|15|16|18)$/.test(image) ? "png" : "webp"}`;
}
