"use client";

import Image from "next/image";
import { useState } from "react";
import roomRisk from "@/../public/figma/img/room-risk.jpg";
import { AftermathCard } from "@/components/AftermathCard";
import { Furigana } from "@/components/ui/Furigana";
import { RISK_KINDS, type Risk } from "@/lib/content";
import { amazonSearchUrl, safetyProductsFor } from "@/lib/recommendations";
import { useSettings } from "@/lib/settings";
import { focusDescription } from "@/lib/focus-description";
import { roomAdvice, roomObjectType } from "@/lib/room-guidance";

const ADVICE = {
  fall: {
    image: "/illustrations/actions/lower-items.webp",
    imageAlt: "一人の大人が本棚の一番下の段に重い本を移すイラスト",
    headline: "重[おも]いものは、低[ひく]い場所[ばしょ]へ",
    adultHeadline: "重い物は低い位置へ移す",
    danger: "転倒・落下により負傷したり、避難経路を塞いだりする可能性があります。",
    action: "通路や就寝場所との位置関係を見直し、重い物は低い位置へ移してください。固定方法は対象物と設置面の条件を確認して選びましょう。",
    childDanger: "たおれたり落[お]ちたりして、けがや逃[に]げ道[みち]をふさぐ原因[げんいん]になるかもしれないよ。",
    childAction: "お家[うち]の人[ひと]と、通[とお]り道[みち]や寝[ね]る場所[ばしょ]の近[ちか]くにないか確認[かくにん]しよう。重[おも]いものは低[ひく]い場所[ばしょ]へ移[うつ]してね。",
  },
  break: {
    image: "/illustrations/actions/check-breakables.webp",
    imageAlt: "一人の大人が割れ物をベッドや通り道から離れた低い収納へ移すイラスト",
    headline: "われるものと、寝[ね]る場所[ばしょ]をチェック",
    adultHeadline: "割れ物と就寝場所・通路の位置を確認",
    danger: "破損した破片で負傷したり、安全に移動できなくなったりする可能性があります。",
    action: "割れ物と就寝場所・通路との位置関係を見直してください。窓の場合は、ガラスの種類や施工条件に合う飛散防止対策を検討しましょう。",
    childDanger: "われたかけらで、けがをするかもしれないよ。",
    childAction: "われるものが寝[ね]る場所[ばしょ]や通[とお]り道[みち]の近[ちか]くにないか、お家[うち]の人[ひと]と確認[かくにん]しよう。",
  },
  block: {
    image: "/illustrations/actions/clear-exit.webp",
    imageAlt: "一人の大人が床の物を収納し、ドアまでの通り道を空けるイラスト",
    headline: "出口[でぐち]までの道[みち]を、すっきり",
    adultHeadline: "通路と出入口の物を片付ける",
    danger: "物が散乱・移動すると、出入口や避難経路が塞がれる可能性があります。",
    action: "まず通路と出入口の物を片付け、扉を開けられる空間を確保してください。購入よりも配置変更・整理を優先しましょう。",
    childDanger: "ものが散[ち]らばると、出口[でぐち]を通[とお]れなくなるかもしれないよ。",
    childAction: "まずはお家[うち]の人[ひと]と、通[とお]り道[みち]やドアの前[まえ]を片[かた]づけよう。ものを買[か]わなくてもできるよ。",
  },
};

export function RiskActions({ photoUrl, risks, activeIndex }: { photoUrl: string | null; risks: Risk[]; activeIndex?: number }) {
  const { audience } = useSettings();
  const adult = audience === "adult";
  const [showAftermath, setShowAftermath] = useState(false);
  const [openedOnce, setOpenedOnce] = useState(false);
  const confirmed = risks.filter((r) => r.confirmed);
  return (
    <section className="overflow-hidden rounded-card bg-surface">
      <div className="p-4">
        <h2 className="font-display text-lg font-bold"><Furigana text="部屋[へや]の危険[きけん]と、できる対策[たいさく]" adult="室内の危険候補と対策" /></h2>
        <p className="mt-2 text-13 text-ink-muted"><Furigana text="写真[しゃしん]の番号[ばんごう]を押[お]すと、説明[せつめい]に移動[いどう]するよ。" adult="写真の番号を押すと、対応する危険と対策の説明へ移動します。" /></p>
        <p className="mt-1 text-11 text-ink-soft">{photoUrl ? "地震前の写真（プライバシー処理後）" : "サンプル写真・サンプルの危険候補（実際の室内の診断ではありません）"}</p>
      </div>
      <div className="relative">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="危険候補を番号付きで示した地震前の室内写真" className="block h-auto w-full" />
        ) : <Image src={roomRisk} alt="危険候補を示したサンプル写真" className="h-auto w-full" />}
        {confirmed.map((risk, index) => {
          if (activeIndex !== undefined && index !== activeIndex) return null;
          const b = risk.bounds ?? { x: Math.max(0, Math.min(74, risk.x - 13)), y: Math.max(0, Math.min(64, risk.y - 18)), w: 26, h: 36 };
          return <button key={risk.id} type="button" aria-controls={`risk-action-${index}`} onClick={() => focusDescription(`risk-action-${index}`)} aria-label={`${index + 1}番の対策を確認`} className="absolute min-h-11 min-w-11 rounded border-[3px] focus-visible:outline-4 focus-visible:outline-white" style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`, borderColor: RISK_KINDS[risk.kind].accent }}><span className="absolute top-0 left-0 grid size-7 place-items-center rounded bg-white font-bold text-black shadow">{index + 1}</span></button>;
        })}
      </div>
      <p className="px-4 pt-3 text-11 text-ink-soft">枠は位置の目安です。写真だけでは固定状態や実際の危険性を判断できません。</p>
      {!confirmed.length && <p className="p-4 text-13">確認済みの危険候補はありません。室内の安全を保証するものではありません。通路や家具の固定状態を実際に確認してください。</p>}
      <ol className="divide-y divide-border px-4">
        {confirmed.map((risk, index) => {
          if (activeIndex !== undefined && index !== activeIndex) return null;
          const type = roomObjectType(risk);
          const advice = ADVICE[type === "elevated_objects" ? "fall" : risk.kind];
          const specific = roomAdvice(risk);
          const products = safetyProductsFor([risk]);
          return <li key={risk.id} id={`risk-action-${index}`} tabIndex={-1} className="scroll-mt-6 rounded-field py-4 focus:bg-primary-soft focus:outline-2 focus:outline-primary-mid">
            <h3 className="font-display font-bold">{index + 1}. <Furigana text={risk.name} adult={risk.adultName} /></h3>
            <p className="mt-2 text-13 text-ink-muted"><Furigana text={advice.childDanger} adult={advice.danger} /></p>
            <div className="mt-3 rounded-field bg-primary-soft p-3">
              <p className="text-11 text-primary-ink">地震前に・大人と一緒に</p>
              <p className="mt-1 font-bold"><Furigana text={specific.headline} /></p>
              <ol className="mt-2 space-y-2">
                {specific.steps.map((text, i) => <li key={text} className="flex gap-2 text-13"><span className="font-bold text-primary-ink">{i + 1}</span><Furigana text={text} /></li>)}
              </ol>
            </div>
            {type !== "tv" && type !== "cupboard" && <figure className="mt-4 overflow-hidden rounded-field border border-border bg-primary-soft">
              <figcaption className="px-3 pt-3">
                <p className="text-11 font-bold text-primary-ink"><Furigana text="地震[じしん]の前[まえ]に・お家[うち]の人[ひと]と" adult="地震前にできる備え" /></p>
                <p className="mt-1 font-display text-15 font-bold"><Furigana text={advice.headline} adult={advice.adultHeadline} /></p>
              </figcaption>
              <Image src={advice.image} alt={advice.imageAlt} width={1536} height={1024} sizes="(max-width: 480px) 100vw, 448px" className="mt-3 h-auto w-full" />
              <p className="px-3 py-2 text-11 text-ink-muted">対策のイメージ図（AI生成）。撮影した部屋の再現ではありません。</p>
            </figure>}
            <details className="mt-3 rounded-field bg-canvas p-3">
              <summary className="min-h-6 cursor-pointer text-13 font-bold"><Furigana text="くわしい対策[たいさく]を見[み]る" adult="対策の詳細・注意点" /></summary>
              <p className="mt-2 text-13 leading-relaxed"><Furigana text={specific.detail} /></p>
            </details>
            {adult && products.length > 0 && <details className="mt-3 rounded-field bg-primary-soft p-3">
              <summary className="cursor-pointer text-13 font-bold">購入候補も確認する</summary>
              <p className="text-13 font-bold">対策を補う購入候補</p>
              {products.map((product) => <div key={product.id} className="mt-3">
                <p className="text-13 font-bold">{product.name}</p>
                <p className="mt-1 text-11">{product.reason}</p>
                <a href={amazonSearchUrl(product.query)} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center rounded-pill border border-primary-mid bg-surface px-4 text-13 font-bold text-primary-ink" aria-label={`${product.name}をAmazonで検索（新しいタブ）`}>Amazonで候補を見る ↗</a>
              </div>)}
              <p className="mt-3 text-11">対象物の寸法・重量、設置面、製品仕様を確認してください。外部サイトの検索結果を開きます。特定商品の安全性を保証するものではありません。</p>
            </details>}
          </li>;
        })}
      </ol>
      <div className="border-t border-border p-4">
        <a href="https://www.tfd.metro.tokyo.lg.jp/learning/elib/kagutenhandbook.html" target="_blank" rel="noopener noreferrer" className="text-11 underline">対策の参考：東京消防庁 家具類の転倒・落下・移動防止対策 ↗</a>
        <button hidden={activeIndex !== undefined} type="button" aria-expanded={showAftermath} aria-controls="aftermath-preview" onClick={() => { setOpenedOnce(true); setShowAftermath(!showAftermath); }} className="mt-4 min-h-11 w-full rounded-pill border border-border px-3 text-13 font-bold">
          <Furigana text={showAftermath ? "予想図[よそうず]を閉[と]じる" : "地震[じしん]のあとの様子[ようす]を見[み]る"} adult={showAftermath ? "予測画像を閉じる" : "地震後の様子を見る（予測画像）"} />
        </button>
        <div id="aftermath-preview" hidden={!showAftermath} className="mt-3">{openedOnce && <AftermathCard photoUrl={photoUrl} risks={risks} />}</div>
      </div>
    </section>
  );
}
