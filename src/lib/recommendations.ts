import type { Risk, RoomObjectType } from "./content";
import { adultText } from "./adult-copy";

export type SafetyProduct = {
  id: string;
  name: string;
  reason: string;
  easyName: string;
  easyReason: string;
  query: string;
  riskNames: string[];
  adultRiskNames: string[];
};

type ProductRule = Omit<SafetyProduct, "riskNames" | "adultRiskNames"> & {
  objectTypes?: RoomObjectType[];
  kind?: Risk["kind"];
  fallbackForKind?: boolean;
};

const RULES: ProductRule[] = [
  {
    id: "furniture-anchor",
    name: "家具転倒防止器具",
    reason: "本棚や背の高い家具を壁・天井側から固定します。設置場所に合う方式を選んでください。",
    easyName: "家具[かぐ]の転倒防止[てんとうぼうし]グッズ",
    easyReason: "本棚[ほんだな]や背[せ]の高[たか]い家具[かぐ]を、かべや天井[てんじょう]に固定[こてい]するよ。",
    query: "家具 転倒防止器具 防災",
    objectTypes: ["bookshelf", "tall_furniture"],
    kind: "fall",
    fallbackForKind: false,
  },
  {
    id: "tv-belt",
    name: "テレビ転倒防止ベルト",
    reason: "テレビ本体をテレビ台や壁面に固定し、転倒や落下を抑えます。",
    easyName: "テレビの転倒防止[てんとうぼうし]ベルト",
    easyReason: "テレビをテレビ台[だい]やかべに固定[こてい]して、たおれにくくするよ。",
    query: "テレビ 転倒防止ベルト 防災",
    objectTypes: ["tv"],
    kind: "fall",
  },
  {
    id: "anti-slip-gel",
    name: "耐震ジェル・滑り止めマット",
    reason: "小型家電や机上の物の移動・落下を抑える補助用品です。",
    easyName: "耐震[たいしん]ジェル・すべり止[ど]めマット",
    easyReason: "小[ちい]さな家電[かでん]や机[つくえ]の上[うえ]のものが、動[うご]いたり落[お]ちたりするのをおさえるよ。",
    query: "耐震ジェル 滑り止めマット 防災",
    objectTypes: [],
    kind: "fall",
  },
  {
    id: "safety-film",
    name: "ガラス飛散防止フィルム",
    reason: "窓ガラスが割れた際の破片の飛散を抑えます。ガラスの種類と寸法を確認してください。",
    easyName: "ガラス飛散防止[ひさんぼうし]フィルム",
    easyReason: "窓[まど]ガラスがわれたとき、破片[はへん]が飛[と]び散[ち]るのをおさえるよ。",
    query: "窓ガラス 飛散防止フィルム 防災",
    objectTypes: ["window"],
    kind: "break",
    fallbackForKind: false,
  },
  {
    id: "hanging-wire",
    name: "落下防止ワイヤー",
    reason: "照明や壁掛け物などの落下を抑えるため、補助的に固定します。",
    easyName: "落下防止[らっかぼうし]ワイヤー",
    easyReason: "照明[しょうめい]やかべにかけたものが落[お]ちないように、追加[ついか]で固定[こてい]するよ。",
    query: "落下防止ワイヤー 家具 防災",
    objectTypes: ["hanging_object"],
    kind: "fall",
  },
];

export function amazonSearchUrl(query: string) {
  return `https://www.amazon.co.jp/s?k=${encodeURIComponent(query)}`;
}

/** 写真で検出され、利用者も確認した危険だけから購入候補を作る。 */
export function safetyProductsFor(risks: Risk[]): SafetyProduct[] {
  const confirmed = risks.filter((risk) => risk.confirmed);

  return RULES.flatMap((rule) => {
    const matches = confirmed.filter((risk) => {
      const kindMatch = !rule.kind || rule.kind === risk.kind;
      const typeMatch = kindMatch && risk.objectType && rule.objectTypes?.includes(risk.objectType);
      const kindFallback = rule.fallbackForKind && !risk.objectType && rule.kind === risk.kind;
      return Boolean(typeMatch || kindFallback);
    });

    return matches.length > 0
      ? [{
          ...rule,
          riskNames: [...new Set(matches.map((risk) => risk.name))],
          adultRiskNames: [...new Set(matches.map((risk) => risk.adultName ?? adultText(risk.name)))],
        }]
      : [];
  });
}
