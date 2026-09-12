import type { Risk, RoomObjectType } from "./content";

/** 古い解析結果でも棚上の物を床置き品として扱わない。新規解析は専用分類を使う。 */
export function roomObjectType(risk: Risk): RoomObjectType {
  const name = `${risk.name} ${risk.adultName ?? ""}`.replace(/\[[^\]]*\]/g, "");
  if (/棚の上|棚上|高い場所|収納の上/.test(name)) return "elevated_objects";
  if (/食器棚|しょっきだな|カップボード/.test(name)) return "cupboard";
  return risk.objectType ?? "other";
}

type Advice = { headline: string; steps: string[]; detail: string };

function isGlassDoor(risk: Risk): boolean {
  if (roomObjectType(risk) === "cupboard") return false;
  const name = `${risk.name} ${risk.adultName ?? ""}`.replace(/\[[^\]]*\]/g, "");
  return /ガラス/.test(name) && /ドア|扉|戸/.test(name);
}

const GLASS_DOOR_ADVICE: Record<"child" | "adult", Advice> = {
  child: {
    headline: "ガラスのドアから離[はな]れる備[そな]えを",
    steps: ["ガラスのそばで遊[あそ]ばないようにしよう", "われたガラスが飛[と]び散[ち]りにくくなるシートを、家族と調[しら]べよう"],
    detail: "揺[ゆ]れたらガラスから離[はな]れよう。破片[はへん]に素手[すで]や素足[すあし]で触[ふ]れないこと。",
  },
  adult: {
    headline: "ガラスのドアの飛散対策を",
    steps: ["ガラスに適合する飛散防止フィルムを確認", "ドア付近に長く過ごす場所を作らない", "破損時に使える別の通路も確認"],
    detail: "フィルムはガラスの種類・施工条件に適合するものを選びます。揺れの最中はガラスから離れ、破片に素手・素足で触れないでください。",
  },
};
const ADVICE: Partial<Record<RoomObjectType, Advice>> = {
  cupboard: {
    headline: "食器が飛び出さない備えを",
    steps: ["使ったら扉を閉める", "扉が開くのを防ぐ器具を確認", "棚本体の固定とガラス対策も"],
    detail: "扉を閉めるだけでは開く場合があります。開放防止器具・棚の固定・ガラス対策を、製品の適合条件に沿って確認してください。",
  },
  tv: {
    headline: "テレビと台を、セットで固定",
    steps: ["説明書で使える固定器具を確認", "対応するベルト・粘着マットを選ぶ", "テレビ台自体の固定も確認"],
    detail: "テレビと設置面に適合する器具を選び、台の固定も確認します。一般的な滑り止めだけでは転倒を防げるとは限りません。",
  },
  bookshelf: {
    headline: "本棚を固定し、本の飛び出しも防ぐ",
    steps: ["壁への固定方法と器具の適合を確認", "重い本は下の段にしまう", "棚の落下防止バーなどを確認"],
    detail: "壁と棚に適合する器具を使い、出口や寝る場所を塞がない配置にします。賃貸は管理者へ確認し、移動・取り付けは安全に作業できる人数で行います。",
  },
  elevated_objects: {
    headline: "棚の上から落ちる物を減らす",
    steps: ["重い物・割れ物は低い収納へ", "棚の端に物を置かない", "落ちる先にベッドや通路がないか確認"],
    detail: "高い所の物は安定した足場で安全に下ろします。揺れている間は取りに行かず、手で支えないでください。",
  },
  doorway: {
    headline: "通れる道と、開けられる扉を",
    steps: ["ドアまでの床に物を置かない", "扉が動く範囲も空ける", "倒れて出口をふさぐ家具を見直す"],
    detail: "通路と扉の動く範囲を空けます。地震後は安全を確かめ、重い家具や破片は無理に動かさず、別の出口を検討し、周囲に助けを求めてください。",
  },
  window: {
    headline: "ガラスから距離をとれる配置に",
    steps: ["寝る場所を窓から離す", "ガラスに合う飛散防止対策を確認", "近くに靴と明かりを備える"],
    detail: "フィルムはガラスの種類や施工条件に合うものを選びます。揺れの最中は窓から離れて頭を守り、揺れが収まっても破片に素手・素足で触れないようにしましょう。",
  },
  bed: {
    headline: "寝る場所と、枕元の備えを確認",
    steps: ["頭の上に落ちる物を置かない", "周囲の家具が倒れる向きを確認", "手の届く所に靴と懐中電灯を"],
    detail: "非常用の靴とライトを袋などにまとめ、枕元の取り出しやすい位置に備えます。揺れで散乱しない置き方を確認してください。",
  },
};
const CHILD_ADVICE: Partial<Record<RoomObjectType, Advice>> = {
  bookshelf: { headline: "重[おも]い本[ほん]は、下[した]の段[だん]へ", steps: ["重[おも]い本[ほん]を下[した]にしまおう", "本[ほん]が落[お]ちない工夫[くふう]をしよう", "本棚[ほんだな]の固定[こてい]は、家族に相談[そうだん]しよう"], detail: "重い本棚[ほんだな]の移動[いどう]や金具の取り付けは、家族と相談して進めよう。" },
  cupboard: { headline: "食器[しょっき]が飛[と]び出[だ]さないようにしよう", steps: ["重[おも]いお皿[さら]は下[した]の段[だん]へ", "使[つか]ったら扉[とびら]を閉[し]めよう", "扉[とびら]が開[ひら]かない道具[どうぐ]を、家族と調[しら]べよう"], detail: "扉[とびら]を閉[し]めるだけでは、ゆれで開[ひら]くこともあるよ。棚[たな]の固定[こてい]も、家族に相談[そうだん]しよう。" },
  tv: { headline: "テレビが倒[たお]れないようにしよう", steps: ["テレビをとめるベルトを、家族と調[しら]べよう", "テレビ台[だい]も倒[たお]れないか見[み]てもらおう"], detail: "テレビは重いため、一人で無理やり動かさないこと。固定する作業は家族に相談しよう。" },
  elevated_objects: { headline: "棚[たな]の上[うえ]のものは、低[ひく]い所[ところ]へ", steps: ["重[おも]いものや、われるものを下[した]におろそう", "棚[たな]のはしに、ものを置[お]かないようにしよう"], detail: "高い所の物は、家族と安全に下ろそう。揺[ゆ]れている間は取りに行かないこと。" },
  doorway: { headline: "ドアまでの道[みち]をあけよう", steps: ["床[ゆか]の荷物[にもつ]を片[かた]づけよう", "ドアが開[ひら]く所[ところ]にも、ものを置[お]かないようにしよう"], detail: "大きな家具の移動[いどう]は一人で行わず、家族と相談しよう。" },
  window: { headline: "窓[まど]から離[はな]れてすごせるように", steps: ["寝[ね]る場所[ばしょ]を窓[まど]から離[はな]そう", "ガラスが飛[と]び散[ち]りにくくなるシートを、家族と調[しら]べよう"], detail: "割[わ]れたガラスに素手[すで]や素足[すあし]で触[ふ]れないこと。片付けは家族と安全を確[たし]かめてから。" },
  bed: { headline: "寝[ね]る場所[ばしょ]を安全[あんぜん]にしよう", steps: ["頭[あたま]の上[うえ]に、落[お]ちそうなものはないかな？", "近[ちか]くに靴[くつ]とライトを用意[ようい]しよう"], detail: "靴[くつ]とライトは、揺[ゆ]れで散らばらないよう袋[ふくろ]などにまとめ、手が届[とど]く所に備[そな]えよう。" },
};
const CHILD_DEFAULT: Advice = { headline: "落[お]ちたり、倒[たお]れたりしないように", steps: ["重[おも]いものは低[ひく]い所[ところ]に置[お]こう", "寝[ね]る場所[ばしょ]や通[とお]り道[みち]をあけよう"], detail: "重い物の移動[いどう]や固定は、一人で行わず家族に相談しよう。" };

export function roomAdvice(risk: Risk, audience: "child" | "adult" = "adult"): Advice {
  if (isGlassDoor(risk)) return GLASS_DOOR_ADVICE[audience];
  if (audience === "child") return CHILD_ADVICE[roomObjectType(risk)] ?? (risk.kind === "block" ? CHILD_ADVICE.doorway! : CHILD_DEFAULT);
  return ADVICE[roomObjectType(risk)] ?? (risk.kind === "block" ? ADVICE.doorway! : {
    headline: "落下・転倒する先を確かめる",
    steps: ["人のいる場所や通路から離す", "物に合う固定方法と器具の適合を確認", "重い物は低い場所へ"],
    detail: "写真だけでは固定状態を判断できません。対象物と設置面に合う方法を説明書で確認し、安全に作業できる方法で備えましょう。",
  });
}

export const EXIT_EXPLANATION = [
  "揺れが収まったら、すぐに歩き出さず、まず足元や周囲の破片・倒れた物を確認します。手元に明かりがあれば使い、安全に手が届く所に靴がある場合に履きます。靴下や薄いスリッパでは破片から十分に守れません。靴を履いても、破片を踏まない道を選びます。",
  "靴をすぐ履けるとは限りません。靴が手元にないときは、破片のある床を裸足で歩いて取りに行かず、安全に移動できない場合は周囲に助けを求めます。火や煙など切迫した危険があるときは靴探しを優先せず、避難と助けを求める行動を優先します。",
  "足元と周囲を確かめ、ドアまで通れる道と、扉を開ける空間を確認します。安全に近づけるなら扉を開けますが、重い家具やガラスを無理にどけたり、開かない扉を無理に開けたりしません。別の安全な出口や大人の助けを考えます。",
];

/** 手元の教材イラストから、その対象の備えに合うものだけを選ぶ。 */
export function roomAdviceImage(risk: Risk): { src: string; alt: string } | null {
  const type = roomObjectType(risk);
  if (type === "cupboard") return { src: "/illustrations/actions/cupboard-dishes-v7.png", alt: "大人がお皿を食器棚の低い段へしまい、子どもが見守る様子" };
  if (isGlassDoor(risk)) return { src: "/illustrations/actions/glass-door-v7.png", alt: "親子がガラスのドアから距離をとり、危険を確認する様子" };
  if (["bookshelf", "tall_furniture", "elevated_objects"].includes(type)) return { src: "/illustrations/actions/lower-items-v4.webp", alt: "大人が重いものを下の段へ移し、子どもが見守る様子" };
  if (type === "tv") return { src: "/illustrations/products/tv-belt.png", alt: "テレビを台に固定するベルトの例" };
  if (["doorway", "loose_objects"].includes(type) || risk.kind === "block") return { src: "/illustrations/actions/clear-path-v8.png", alt: "通路の荷物を収納し、ドアまでの道を空ける様子" };
  if (["window", "bed"].includes(type)) return { src: "/illustrations/actions/check-breakables-v4.webp", alt: "親子で割れるものと寝る場所の位置を確認する様子" };
  return null;
}
