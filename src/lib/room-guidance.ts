import type { Risk, RoomObjectType } from "./content";

/** 古い解析結果でも棚上の物を床置き品として扱わない。新規解析は専用分類を使う。 */
export function roomObjectType(risk: Risk): RoomObjectType {
  const name = `${risk.name} ${risk.adultName ?? ""}`.replace(/\[[^\]]*\]/g, "");
  if (/ピアノ|ギター|バイオリン|ヴァイオリン|楽器|キーボード|ドラム/.test(name) && !/洗濯/.test(name)) return "instrument";
  if (/ハンガーラック|ポールハンガー|コートハンガー|衣類ラック|コート掛け/.test(name)) return "clothes_rack";
  if (/ケージ|ペット.*ゲージ/.test(name)) return "pet_cage";
  if (/洗濯機/.test(name)) return "washing_machine";
  if (/棚の上|棚上|高い場所|収納の上/.test(name)) return "elevated_objects";
  if (/食器棚|しょっきだな|カップボード/.test(name)) return "cupboard";
  if (/背の高い.*棚|背の高い.*収納|背の高い.*家具/.test(name)) return "tall_furniture";
  return risk.objectType ?? "other";
}

export function isCooktop(risk: Risk): boolean {
  const name = `${risk.name} ${risk.adultName ?? ""}`.replace(/\[[^\]]*\]/g, "");
  return /コンロ|こんろ|ガステーブル|クッキングヒーター|cooktop|stovetop/i.test(name);
}

type Advice = { headline: string; steps: string[]; detail: string };

export function isWallMountedTv(risk: Risk): boolean {
  return roomObjectType(risk) === "tv" && /壁掛|壁かけ|壁付|壁内|埋め込|埋込/.test(`${risk.name} ${risk.adultName ?? ""}`);
}

function isGlassDoor(risk: Risk): boolean {
  if (roomObjectType(risk) === "cupboard") return false;
  const name = `${risk.name} ${risk.adultName ?? ""}`.replace(/\[[^\]]*\]/g, "");
  return /ガラス/.test(name) && /ドア|扉|戸/.test(name);
}

const GLASS_DOOR_ADVICE: Record<"child" | "adult", Advice> = {
  child: {
    headline: "ガラスのドアの飛散[ひさん]対策[たいさく]を",
    steps: ["ガラスのドアの近くに寝[ね]る場所を作らないようにしよう", "われたガラスが飛[と]び散[ち]りにくくなるシートを、家族と調[しら]べよう"],
    detail: "",
  },
  adult: {
    headline: "ガラスのドアの飛散対策を",
    steps: ["ガラスに適合する飛散防止フィルムを確認", "ドア付近に長く過ごす場所を作らない", "破損時に使える別の通路も確認"],
    detail: "",
  },
};
const ADVICE: Partial<Record<RoomObjectType, Advice>> = {
  tall_furniture: { headline: "棚本体の転倒と、中身の飛び出しを防ぐ", steps: ["棚と壁の下地に合う金具で、本体を固定", "開いた棚には落下防止バー、扉には開放防止器具を確認", "重い物は下段へ。倒れる範囲に寝る場所や通路を作らない"], detail: "本体の固定と収納物の落下防止は別の対策です。器具は家具・壁・天井の構造に適合するものを選び、取り付けは説明書や施工業者に確認してください。" },
  instrument: { headline: "楽器に合う収納・転倒防止を", steps: ["小型の楽器はケースに入れ、低い安定した場所へ", "ピアノやスタンドは機種に合う地震対策を販売店に確認", "倒れたり移動したりする範囲に寝る場所や通路を作らない"], detail: "ピアノなど重量のある楽器の移動・固定は専門業者へ相談してください。通常のスタンドやキャスター受けだけで地震対策になるとは限りません。" },
  clothes_rack: { headline: "衣類・バッグの掛けすぎと偏りを見直す", steps: ["重いバッグは低い収納へ", "耐荷重を守り、片側に集中して掛けない", "転倒・移動で出入口を塞がない配置にする"], detail: "キャスターや固定器具はラックの説明書に沿って確認します。突っ張り式も天井・床への適合と緩みを確認してください。" },
  pet_cage: { headline: "ケージの周りに落下・転倒する物を置かない", steps: ["上から物が落ちず、家具が倒れ込まない場所へ", "ケージの安定・扉の留め具を確認", "避難用キャリーに慣れる練習も日頃から"], detail: "ケージの固定は製品の構造に合う方法を確認します。動物を直接つなぎ付けたり、出入りや通気を妨げたりしないでください。" },
  washing_machine: { headline: "洗濯機の設置状態と水漏れへの備えを", steps: ["本体・台が安定しているか、説明書に沿って確認", "上の棚や乾燥機の固定も確認", "使っていないときは水道栓を閉める"], detail: "重さだけで動かないとは判断できません。ホース接続や設置台を確認し、移動・固定方法はメーカーや設置業者へ相談してください。" },
  cupboard: {
    headline: "食器が飛び出さない備えを",
    steps: ["使ったら扉を閉める", "扉が開くのを防ぐ器具を確認", "棚本体の固定とガラス対策も"],
    detail: "扉を閉めるだけでは開く場合があります。開放防止器具・棚の固定・ガラス対策を、製品の適合条件に沿って確認してください。",
  },
  tv: {
    headline: "テレビの設置方法に合う対策を",
    steps: ["台置きなら、テレビと台に合う固定器具を確認", "壁掛け・壁内設置なら、壁と金具の強度を施工業者に確認"],
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
    detail: "高い所の物は安定した足場で、安全に作業できる人数で下ろします。",
  },
  doorway: {
    headline: "通れる道と、開けられる扉を",
    steps: ["ドアまでの床に物を置かない", "扉が動く範囲も空ける", "倒れて出口をふさぐ家具を見直す"],
    detail: "通路と扉の動く範囲を空けます。重い家具の配置変更は、安全に作業できる人数で行ってください。",
  },
  window: {
    headline: "ガラスから距離をとれる配置に",
    steps: ["寝る場所を窓から離す", "ガラスに合う飛散防止対策を確認", "近くに靴と明かりを備える"],
    detail: "フィルムはガラスの種類や施工条件に合うものを選び、窓の近くに寝る場所を作らない配置を考えます。",
  },
  bed: {
    headline: "寝る場所と、枕元の備えを確認",
    steps: ["頭の上に落ちる物を置かない", "周囲の家具が倒れる向きを確認", "手の届く所に靴と懐中電灯を"],
    detail: "非常用の靴とライトを袋などにまとめ、枕元の取り出しやすい位置に備えます。揺れで散乱しない置き方を確認してください。",
  },
};
const CHILD_ADVICE: Partial<Record<RoomObjectType, Advice>> = {
  tall_furniture: { headline: "棚を倒れにくく、中の物も飛び出しにくくしよう", steps: ["棚そのものを壁に固定する方法を家族と確認しよう", "中の物が落ちないバーや、扉が開かない器具を調べよう", "重い物は下の段へ。倒れた先に寝る場所や通り道がないか見よう"], detail: "片づけるだけでは、棚は倒れるかもしれないよ。棚の固定と、中の物の落下防止の両方を家族と進めよう。" },
  instrument: { headline: "楽器[がっき]の置き方を見直そう", steps: ["小さな楽器はケースに入れ、低い所にしまおう", "ピアノや楽器の台の地震対策を家族と確認しよう"], detail: "重い楽器は一人で動かさず、家族から専門のお店に相談してもらおう。" },
  clothes_rack: { headline: "服やバッグを掛[か]けすぎないようにしよう", steps: ["重いバッグは低い所にしまおう", "片側だけにたくさん掛けないようにしよう", "倒れてドアをふさがない場所か確認しよう"], detail: "ラックを動かしたり固定したりする作業は、家族と説明書を確認して進めよう。" },
  pet_cage: { headline: "ペットのケージの周りを確認しよう", steps: ["上から物が落ちず、家具が倒れてこない場所にしよう", "ケージがぐらつかないか、扉が閉まるか家族と確認しよう", "避難用のキャリーに慣れる練習もしておこう"], detail: "ケージを固定する方法は家族と調べよう。ペットの出入りや空気の通り道をふさがないようにしよう。" },
  washing_machine: { headline: "洗濯機[せんたくき]の周りも確認しよう", steps: ["洗濯機と台がぐらつかないか家族に見てもらおう", "上にある棚や乾燥機[かんそうき]も確認しよう", "使わないときに水道の栓[せん]を閉める習慣を家族とつけよう"], detail: "重いから大丈夫とは限らないよ。洗濯機を動かす作業は一人でせず、家族から設置したお店に相談してもらおう。" },
  bookshelf: { headline: "本棚を固定し、本の飛び出しも防ごう", steps: ["重[おも]い本[ほん]を下[した]にしまおう", "本[ほん]が落[お]ちない工夫[くふう]をしよう", "本棚[ほんだな]の固定[こてい]は、家族に相談[そうだん]しよう"], detail: "重い本棚[ほんだな]の移動[いどう]や金具の取り付けは、家族と相談して進めよう。" },
  cupboard: { headline: "食器[しょっき]が飛[と]び出[だ]さないようにしよう", steps: ["重[おも]いお皿[さら]は下[した]の段[だん]へ", "使[つか]ったら扉[とびら]を閉[し]めよう", "扉[とびら]が開[ひら]かない道具[どうぐ]を、家族と調[しら]べよう"], detail: "扉[とびら]を閉[し]めるだけでは、ゆれで開[ひら]くこともあるよ。棚[たな]の固定[こてい]も、家族に相談[そうだん]しよう。" },
  tv: { headline: "テレビが倒[たお]れないようにしよう", steps: ["台に置くテレビは、台と一緒に固定する方法を調べよう", "壁に付いたテレビは、取り付けが確かか家族から工事した人に確認してもらおう"], detail: "テレビは重いため、一人で無理やり動かさないようにしよう。固定する作業は家族に相談しよう。" },
  elevated_objects: { headline: "棚[たな]の上[うえ]のものは、低[ひく]い所[ところ]へ", steps: ["重[おも]いものや、われるものを下[した]におろそう", "棚[たな]のはしに、ものを置[お]かないようにしよう"], detail: "高い所の物は、家族と安全に下ろそう。" },
  doorway: { headline: "ドアまでの道[みち]をあけよう", steps: ["床[ゆか]の荷物[にもつ]を片[かた]づけよう", "ドアが開[ひら]く所[ところ]にも、ものを置[お]かないようにしよう"], detail: "大きな家具の移動[いどう]は一人で行わず、家族と相談しよう。" },
  window: { headline: "窓[まど]から離[はな]れてすごせるように", steps: ["寝[ね]る場所[ばしょ]を窓[まど]から離[はな]そう", "ガラスが飛[と]び散[ち]りにくくなるシートを、家族と調[しら]べよう"], detail: "ガラスの種類に合うシートを家族と確認[かくにん]し、寝る場所の配置も相談しよう。" },
  bed: { headline: "寝[ね]る場所[ばしょ]を安全[あんぜん]にしよう", steps: ["頭[あたま]の上[うえ]に、落[お]ちそうなものはないかな？", "近[ちか]くに靴[くつ]とライトを用意[ようい]しよう"], detail: "靴[くつ]とライトは、揺[ゆ]れで散らばらないよう袋[ふくろ]などにまとめ、手が届[とど]く所に備[そな]えよう。" },
};
const CHILD_DEFAULT: Advice = { headline: "落[お]ちたり、倒[たお]れたりしないように", steps: ["重[おも]いものは低[ひく]い所[ところ]に置[お]こう", "寝[ね]る場所[ばしょ]や通[とお]り道[みち]をあけよう"], detail: "重い物の移動[いどう]や固定は、一人で行わず家族に相談しよう。" };

export function roomAdvice(risk: Risk, audience: "child" | "adult" = "adult"): Advice {
  if (isCooktop(risk)) return audience === "child"
    ? { headline: "コンロの周りを片づけて、火災に備えよう", steps: ["ふきん・紙・袋など、燃えやすい物をコンロから離そう", "消火器の置き場所を家族と確認しよう"], detail: "" }
    : { headline: "コンロ周辺の可燃物を減らし、消火の備えを確認", steps: ["ふきん・キッチンペーパー・袋などをコンロから離して収納", "消火器の設置場所と使用方法を確認"], detail: "" };
  if (isGlassDoor(risk)) return GLASS_DOOR_ADVICE[audience];
  if (isWallMountedTv(risk)) return audience === "adult"
    ? { headline: "壁掛け・壁内設置は取付状態を確認", steps: ["テレビと金具の適合・壁の下地や補強を施工業者に確認", "取付ねじ・落下防止機構はメーカーの指定に従う"], detail: "壁の中に収まっていても安全とは断定できません。自分で外したり引っ張ったりせず、施工業者へ点検を相談してください。" }
    : { headline: "壁に付いたテレビは、取り付けを確認しよう", steps: ["壁や金具がテレビを支えられるか、家族から工事した人に確認してもらおう", "自分で引っ張ったり外したりせず、家族に相談しよう"], detail: "壁に付いているから大丈夫とは限らないよ。台に置くテレビとは、固定する方法が違うよ。" };
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
  if (isCooktop(risk)) return { src: "/illustrations/actions/kitchen-question-v8.png", alt: "コンロとその周囲を確認するキッチンのイラスト" };
  if (type === "cupboard") return { src: "/illustrations/actions/cupboard-v13.png", alt: "男性がお皿を食器棚の低い段へしまう様子" };
  if (isGlassDoor(risk)) return { src: "/illustrations/actions/glass-film-v14.png", alt: "大人がガラスのドアに飛散防止フィルムを貼っている様子" };
  if (["bookshelf", "tall_furniture"].includes(type)) return { src: "/illustrations/actions/anchor-shelf-v14.png", alt: "棚本体を壁に金具で固定し、棚の中身に落下防止バーを設けた例" };
  if (type === "elevated_objects") return { src: "/illustrations/actions/lower-items-v17.png", alt: "棚の上にあった厚い本を、大人が低い棚へ移す前後の様子" };
  if (isWallMountedTv(risk)) return null;
  if (type === "tv") return { src: "/illustrations/products/tv-belt.png", alt: "テレビを台に固定するベルトの例" };
  if (["doorway", "loose_objects"].includes(type) || risk.kind === "block") return { src: "/illustrations/actions/clear-floor-v20.png", alt: "床の段ボール箱やリュックを通り道から脇の収納場所へ移す様子" };
  if (["window", "bed"].includes(type)) return { src: "/illustrations/actions/window-bed-v11.png", alt: "親子で割れるものと寝る場所の位置を確認する様子" };
  return null;
}


export function roomAdviceImages(risk: Risk, variant = 0): { src: string; alt: string }[] {
  const first = roomAdviceImage(risk);
  if (!first) return [];
  return roomObjectType(risk) === "elevated_objects"
    ? [variant < 0.5 ? first : { src: "/illustrations/actions/lower-box-v21.png", alt: "同じ棚の上にあった収納箱を下段へ移す前後の例" }]
    : [first];
}
