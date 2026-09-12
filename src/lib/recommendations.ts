import type { Risk, RoomObjectType } from "./content";
import { adultText } from "./adult-copy";
import { roomObjectType } from "./room-guidance";

export type SafetyProduct = {
  id: string;
  name: string;
  reason: string;
  easyName: string;
  easyReason: string;
  query: string;
  examples?: { name: string; specification: string; check: string; url: string }[];
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
    easyReason: "本棚[ほんだな]や背[せ]の高[たか]い家具[かぐ]を、かべや天井[てんじょう]に固定[こてい]します。",
    query: "家具 転倒防止器具 防災",
    objectTypes: ["bookshelf", "tall_furniture", "cupboard"],
    examples: [
      { name: "エレコム TS-F001（L型・2個入り）", specification: "家具と壁に貼り付けるタイプ。耐荷重115kg（2個使用時）。", check: "収納物を含む重量、壁材の適合、壁との隙間を確認。凹凸面や一部の特殊な壁紙には使えません。", url: "https://www.elecom.co.jp/products/TS-F001.html" },
      { name: "アイリスオーヤマ KTB-30R（Sサイズ・2本入り）", specification: "家具上部と天井の間が30〜40cmの場合の候補。", check: "隙間を実測し、天井と家具の強度・設置位置を説明書で確認。ポール式はストッパー式などとの併用も検討します。", url: "https://www.irisohyama.co.jp/products/tool-diy-material/emergency-supplies/earthquake-preparedness-products/furniture-fall-prevention-rod-prop-type" },
    ],
    kind: "fall",
    fallbackForKind: false,
  },
  {
    id: "tv-belt",
    name: "テレビ転倒防止ベルト",
    reason: "テレビ本体をテレビ台や壁面に固定し、転倒や落下を抑えます。",
    easyName: "テレビの転倒防止[てんとうぼうし]ベルト",
    easyReason: "テレビをテレビ台[だい]やかべに固定[こてい]して、倒[たお]れにくくします。",
    query: "テレビ 転倒防止ベルト 防災",
    objectTypes: ["tv"],
    examples: [
      { name: "エレコム TS-001N2（粘着シールタイプ）", specification: "40V型までのテレビ向け耐震ベルト。", check: "画面サイズだけでなく対象機器・貼付面・固定位置の適合を確認。テレビ台自体が倒れない対策も必要です。", url: "https://www.elecom.co.jp/products/TS-001N2.html" },
    ],
    kind: "fall",
  },
  {
    id: "anti-slip-gel",
    name: "耐震ジェル・滑り止めマット",
    reason: "小型家電や机上の物の移動・落下を抑える補助用品です。",
    easyName: "耐震[たいしん]ジェル・すべり止[ど]めマット",
    easyReason: "小[ちい]さな家電[かでん]や机[つくえ]の上[うえ]のものが、動[うご]いたり落[お]ちたりするのをおさえます。",
    query: "耐震ジェル 滑り止めマット 防災",
    objectTypes: [],
    kind: "fall",
  },
  {
    id: "safety-film",
    name: "ガラス飛散防止フィルム",
    reason: "窓ガラスが割れた際の破片の飛散を抑えます。ガラスの種類と寸法を確認してください。",
    easyName: "ガラス飛散防止[ひさんぼうし]フィルム",
    easyReason: "窓[まど]ガラスがわれたとき、破片[はへん]が飛[と]び散[ち]るのをおさえます。",
    query: "窓ガラス 飛散防止フィルム 防災",
    objectTypes: ["window"],
    examples: [
      { name: "ニトムズ M6120 ガラス飛散防止シート", specification: "幅48cm × 長さ1.8m・1枚入り。広幅M6330は幅96cm。", check: "ガラスの寸法・種類を確認。凹凸面は専用のM6070などを比較し、網入り・複層ガラス等への適合はメーカーに確認します。", url: "https://www.nitoms.com/products/glass_shatterproof_sheet/" },
    ],
    kind: "break",
    fallbackForKind: false,
  },
  {
    id: "cupboard-film",
    name: "食器棚用ガラス飛散防止シート",
    easyName: "食器棚[しょっきだな]のガラス用[よう]シート",
    reason: "ガラス扉のある食器棚に使う候補です。扉の開放防止と棚本体の固定は別に必要です。",
    easyReason: "ガラスの扉[とびら]がある食器棚[しょっきだな]用[よう]。棚[たな]の固定[こてい]や扉[とびら]が開[ひら]かない工夫[くふう]も確認[かくにん]しよう。",
    query: "ニトムズ M6130 食器棚用ガラス飛散防止シート",
    objectTypes: ["cupboard"],
    examples: [{ name: "ニトムズ M6130 食器棚用ガラス飛散防止シート", specification: "幅32cm × 長さ1.8m・1枚入り。", check: "ガラス扉がある場合だけ検討。扉の寸法、ガラスの種類、貼付面を確認してください。", url: "https://www.nitoms.com/products/glass_shatterproof_sheet/" }],
  },
  {
    id: "hanging-wire",
    name: "落下防止ワイヤー",
    reason: "照明や壁掛け物などの落下を抑えるため、補助的に固定します。",
    easyName: "落下防止[らっかぼうし]ワイヤー",
    easyReason: "照明[しょうめい]やかべにかけたものが落[お]ちないように、追加[ついか]で固定[こてい]します。",
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
      const typeMatch = kindMatch && rule.objectTypes?.includes(roomObjectType(risk));
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
