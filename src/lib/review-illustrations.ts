import type { Question } from "./content";

type ReviewIllustration = { image: string; alt: string; headline: string; timing: string; secondary?: { image: string; alt: string; headline: string } };
const SCENES: Record<string, ReviewIllustration> = {
  shelter: { image: "desk-hold-v12", alt: "机の下で低くなり、頭を守りながら机の脚をつかむ人のシンプルな図", headline: "丈夫[じょうぶ]で安全[あんぜん]に入[はい]れる机[つくえ]なら下[した]へ。無理[むり]なら頭[あたま]と首[くび]を守[まも]る", timing: "揺れている間" },
  cover: { image: "protect-head", alt: "家具や窓から距離をとり、低い姿勢で頭と首を守る人", headline: "まず頭[あたま]と首[くび]を守[まも]ろう", timing: "揺れている間" },
  fire: { image: "protect-head", alt: "火を消しに走らず、低い姿勢で頭を守る行動の例", headline: "火[ひ]を消[け]しに走[はし]らず、まず頭[あたま]を守[まも]る", timing: "揺れている間／火の始末は収まってから安全を確認" },
  exit: { image: "floor-protection-v19", alt: "丈夫な靴と散乱物、出口までの道を表すシンプルな図", headline: "破片を踏まずに通れる道を確かめよう。安全に動けなければ助けを呼ぼう", timing: "揺れが収まったあと" },
  information: { image: "information-tv-v11", alt: "親子がテレビの情報と日時を確かめる、淡い色の説明イラスト", headline: "発信元[はっしんもと]・日時・場所を確[たし]かめよう", timing: "揺れが収まり、安全な場所で" },
};

/** 選んだ（危険かもしれない）行動ではなく、設問で推奨する行動を描く。 */
export function reviewIllustration(question: Question): ReviewIllustration | null {
  const best = question.choices.reduce<typeof question.choices[number] | undefined>((best, choice) => !best || choice.safety > best.safety ? choice : best, undefined);
  if (!best) return null;
  switch (best.id) {
    case "open-exit": return { image: "open-exit-v22", alt: "足元を確認しながらドアを開ける大人と、後ろで待つ子ども", headline: "足元と周りを確かめてからドアを開け、出口を確かめよう", timing: "揺れが収まったあと" };
    case "check-family": return { image: "family-check-v22", alt: "離れた位置から声をかけ、返事を確かめる親子の図", headline: "自分の安全を確かめたら、家族に声をかけて様子を確かめよう", timing: "揺れが収まったあと" };
    case "shelter-damaged-0": return { image: "damaged-exit-v22", alt: "損傷した建物から離れ、手をつないで歩く大人と子ども", headline: "建物が倒れるおそれがある時は、避難所が開くのを待たずに離れよう", timing: "揺れが収まったあと" };
    case "under-desk": return SCENES.shelter;
    case "cover": case "move-away": case "protect-head": return { ...SCENES.shelter, headline: "近くに丈夫[じょうぶ]な机があり、安全に入れる場合は下へ。難[むずか]しい場合はその場で頭と首を守る" };
    case "curtain": return { ...SCENES.shelter, headline: "窓から離れ、すぐ近くに安全に入れる丈夫な机があれば下へ。難しい場合はその場で頭と首を守る" };
    case "wait": return { ...SCENES.shelter, headline: "火を消しに走らず、まず身を守る。安全に入れる丈夫な机がすぐ近くにあれば下へ" };
    case "kitchen-check": return {
      image: "cooktop-off-v20",
      alt: "コンロの手前のつまみを操作して火を止める大人",
      headline: "① コンロの火を止める",
      timing: "揺れが収まったあと・安全に近づける場合だけ",
      secondary: { image: "gas-shutoff-v21", alt: "配管の元栓に手を添えて閉める大人", headline: "② ガスの元栓を閉める" },
    };
    case "shelter-tsunami-0": return { image: "coast-evacuate-v20", alt: "海から離れ、高台へ向かって歩く大人と子ども", headline: "海の近くで強い揺れや長い揺れを感じたら、津波警報を待たず高い場所へ", timing: "揺れが収まったあと・海の近く" };
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

/** 各場面に、白地・淡い色・少し揺れる輪郭の説明イラストを対応させる。 */
const TEXTBOOK_IMAGES: Record<string, string> = {
  "desk-hold-v12": "shelter-v3.webp", "protect-head": "shelter-v3.webp",
  "floor-protection-v19": "exit-v4.webp", "information-tv-v11": "information-v4.webp",
  "open-exit-v22": "open-exit-v2.webp", "family-check-v22": "family-check-v4.webp",
  "damaged-exit-v22": "damaged-exit-v2.webp", "cooktop-off-v20": "kitchen-v2.webp",
  "gas-shutoff-v21": "gas-valve-v2.webp", "coast-evacuate-v20": "actions/coast-evacuate-v2.webp",
  "shelter-home-v4": "information-v4.webp", "shelter-tsunami-v4": "actions/coast-evacuate-v2.webp", "home-bed-v4": "bed-v2.webp",
  "classroom-desk-v4": "shelter-v3.webp", "classroom-exit-v4": "exit-v4.webp", "classroom-reunion-v4": "reunion-v2.webp",
  "office-copier-v4": "printer-v2.webp", "office-elevator-v4": "stairs-v2.webp", "office-stay-v4": "office-v2.webp",
};

/** 固定素材を再利用する。表示のために画像生成APIは呼ばない。 */
export function reviewImagePath(image: string): string {
  const illustration = TEXTBOOK_IMAGES[image];
  if (illustration) return `/illustrations/textbook/${illustration}`;
  if (/-v(?:19|20|21|22)$/.test(image)) return `/illustrations/actions/${image}.png`;
  if (image === "kitchen-question-v8") return "/illustrations/actions/kitchen-question-v8.png";
  return `/illustrations/review/${image}.${/-v(?:5|6|11|12|13|14|15|16|18)$/.test(image) ? "png" : "webp"}`;
}
