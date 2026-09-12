import type { HazardEvent } from "./evac-content";
import type { GeoCategory, GeoEvidence } from "./geo-types";

const descriptions: Record<
  GeoCategory,
  { title: string; situation: string; hint: string; followUp: string }
> = {
  slope: {
    title: "斜面[しゃめん]の近[ちか]くで揺[ゆ]れた想定[そうてい]",
    situation:
      "地形データでは、この周辺に斜面に関係する地形があります。地震のあと、落石や土砂で通りにくくなる可能性を考える想定です。崩れたことを確認した情報ではありません。どのように周囲を確認しますか？",
    hint: "斜面の位置や道路との関係は現地でも確かめ、地震後は自治体の情報と周囲の状況を確認します。",
    followUp: "この道の斜面の位置と、斜面から離れる別の経路を平常時に確認する",
  },
  liquefaction: {
    title: "地面[じめん]の変化[へんか]を考[かんが]える想定[そうてい]",
    situation:
      "周辺の地形は、液状化への注意を考える材料になる分類です。地震のあと、地面の沈みや段差ができた場合を想定します。実際に液状化したという情報ではありません。どのように進みますか？",
    hint: "地形分類は一般的な傾向です。地盤の詳しい状態や発生の有無までは分かりません。足元と自治体の情報を確認する練習です。",
    followUp:
      "この地域の液状化想定と、地面に変化があった場合の別の道を確認する",
  },
  shaking: {
    title: "揺[ゆ]れのあとに道[みち]を確[たし]かめる想定[そうてい]",
    situation:
      "周辺には、揺れや地盤の変化に注意を考える地形があります。大きな地震のあとに、周囲を確かめながら避難する想定です。建物や道路の被害が分かっているわけではありません。何を確認して進みますか？",
    hint: "地形だけでは個々の建物や道の安全性は決まりません。実際の被害と公的な情報をあわせて確認することが必要です。",
    followUp: "自治体の地震防災マップで自宅付近の地盤と避難先を確認する",
  },
};
export function makeGeoEvent(
  category: GeoCategory,
  evidence: GeoEvidence,
): HazardEvent {
  const description = descriptions[category];
  return {
    id: `geo:${evidence.featureId}:${category}`,
    kind: "terrain",
    ...description,
    evidence,
    zone: { x: 0, y: 0, w: 100, h: 100 },
    reference: { label: evidence.sourceName, url: evidence.sourceUrl },
    choices: [
      {
        id: "go",
        label: "周囲を確かめながら進む",
        detail: "足元と道の状況を見ながら進む",
        feedback: "進みながら確かめたことを振り返りましょう。",
        pros: ["移動を続けながら情報を集められる"],
        cons: ["先の区間の状況が分からないまま近づく可能性がある"],
        priority: 1,
        extraSeconds: 0,
        reroute: false,
      },
      {
        id: "distance",
        label: "いったん止まって状況を確認する",
        detail: "周囲や自治体の情報を確かめる",
        feedback: "立ち止まる場所も含めて振り返りましょう。",
        pros: ["進路を判断するための情報を集める時間が取れる"],
        cons: ["その場に留まること自体が適切かを確かめる必要がある"],
        priority: 2,
        extraSeconds: 30,
        reroute: false,
      },
      {
        id: "detour",
        label: "別の道を検討する",
        detail: "今の地点から別の経路を調べる",
        feedback: "別の道で新たに確認することを考えましょう。",
        pros: ["別の経路を比較する機会ができる"],
        cons: ["別の道が安全とは限らず、その先の状況確認も必要になる"],
        priority: 2,
        extraSeconds: 0,
        reroute: true,
      },
    ],
  };
}
