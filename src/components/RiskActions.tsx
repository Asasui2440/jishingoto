"use client";

import Image from "next/image";
import { useState } from "react";
import roomRisk from "@/../public/figma/img/room-risk.jpg";
import { AftermathCard } from "@/components/AftermathCard";
import { Furigana } from "@/components/ui/Furigana";
import { RISK_KINDS, type Risk } from "@/lib/content";
import { SafetyProducts } from "@/components/SafetyProducts";
import { useSettings } from "@/lib/settings";
import { roomAdvice, roomObjectType } from "@/lib/room-guidance";

const ADVICE = {
  fall: {
    image: "/illustrations/actions/lower-items-v4.webp",
    imageAlt: "大人が本棚の一番下の段に重い本をしまい、子どもが見守るイラスト",
    headline: "重[おも]いものは、低[ひく]い場所[ばしょ]へ",
    adultHeadline: "重い物は低い位置へ移す",
    danger: "転倒・落下により負傷したり、避難経路を塞いだりする可能性があります。",
    action: "通路や就寝場所との位置関係を見直し、重い物は低い位置へ移してください。固定方法は対象物と設置面の条件を確認して選びましょう。",
    childDanger: "たおれたり落[お]ちたりして、けがや逃[に]げ道[みち]をふさぐ原因[げんいん]になる可能性[かのうせい]があります。",
    childAction: "お家[うち]の人[ひと]と、通[とお]り道[みち]や寝[ね]る場所[ばしょ]の近[ちか]くにないか確認[かくにん]しよう。重[おも]いものは低[ひく]い場所[ばしょ]へ移[うつ]してね。",
  },
  break: {
    image: "/illustrations/actions/check-breakables-v4.webp",
    imageAlt: "親子で割れものとベッド、通り道の位置関係を確認するイラスト",
    headline: "われるものと、寝[ね]る場所[ばしょ]をチェック",
    adultHeadline: "割れ物と就寝場所・通路の位置を確認",
    danger: "破損した破片で負傷したり、安全に移動できなくなったりする可能性があります。",
    action: "割れ物と就寝場所・通路との位置関係を見直してください。窓の場合は、ガラスの種類や施工条件に合う飛散防止対策を検討しましょう。",
    childDanger: "われたかけらで、けがをする可能性[かのうせい]があります。",
    childAction: "われるものが寝[ね]る場所[ばしょ]や通[とお]り道[みち]の近[ちか]くにないか、お家[うち]の人[ひと]と確認[かくにん]しよう。",
  },
  block: {
    image: "/illustrations/actions/clear-path-v8.png",
    imageAlt: "荷物を収納し、ドアまでの通路を空けるイラスト",
    headline: "出口[でぐち]までの道[みち]を、すっきり",
    adultHeadline: "通路と出入口の物を片付ける",
    danger: "物が散乱・移動すると、出入口や避難経路が塞がれる可能性があります。",
    action: "まず通路と出入口の物を片付け、扉を開けられる空間を確保してください。購入よりも配置変更・整理を優先しましょう。",
    childDanger: "ものが散[ち]らばると、出口[でぐち]を通[とお]れなくなる可能性[かのうせい]があります。",
    childAction: "まずはお家[うち]の人[ひと]と、通[とお]り道[みち]やドアの前[まえ]を片[かた]づけよう。ものを買[か]わなくてもできるよ。",
  },
};

export function RiskActions({ photoUrl, risks }: { photoUrl: string | null; risks: Risk[] }) {
  const { audience } = useSettings();
  const [showAftermath, setShowAftermath] = useState(false);
  const [openedOnce, setOpenedOnce] = useState(false);
  const confirmed = risks.filter((r) => r.confirmed);
  const [selectedId, setSelectedId] = useState<string | null>(confirmed[0]?.id ?? null);
  const selectedIndex = Math.max(0, confirmed.findIndex((risk) => risk.id === selectedId));
  const selected = confirmed[selectedIndex];
  const selectedType = selected ? roomObjectType(selected) : null;
  const selectedAdvice = selected && selectedType ? ADVICE[selectedType === "elevated_objects" ? "fall" : selected.kind] : null;
  const specific = selected ? roomAdvice(selected, audience) : null;

  // 近い位置の番号は少しずつずらし、重なって押せなくなるのを避ける。
  const markerOffsets = confirmed.map((risk, index) => {
    const nearbyBefore = confirmed.slice(0, index).filter((other) => Math.hypot(other.x - risk.x, other.y - risk.y) < 12).length;
    const offsets = [[0, 0], [18, -18], [-18, 18], [18, 18], [-18, -18]];
    return offsets[nearbyBefore % offsets.length];
  });

  return (
    <section className="overflow-hidden rounded-card bg-surface">
      <div className="p-4">
        <h2 className="font-display text-lg font-bold"><Furigana text="部屋[へや]で見[み]つかった危険[きけん]" adult="室内で見つかった危険候補" /></h2>
        <p className="mt-2 text-13 text-ink-muted"><Furigana text="番号[ばんごう]か名前[なまえ]を押[お]すと、その場所[ばしょ]の説明[せつめい]が下[した]に出[で]るよ。" adult="番号または名前を選ぶと、その場所の説明が下に表示されます。" /></p>
        <p className="mt-1 text-11 text-ink-soft">{photoUrl ? "地震前の写真（プライバシー処理後）" : "サンプル写真・サンプルの危険候補（実際の室内の診断ではありません）"}</p>
      </div>
      <div className="relative">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="危険候補を番号付きで示した地震前の室内写真" className="block h-auto w-full" />
        ) : <Image src={roomRisk} alt="危険候補を示したサンプル写真" className="h-auto w-full" />}
        {confirmed.map((risk, index) => {
          const active = selected?.id === risk.id;
          const [offsetX, offsetY] = markerOffsets[index];
          return <button key={risk.id} type="button" aria-pressed={active} aria-controls="selected-risk-explanation" onClick={() => setSelectedId(risk.id)} aria-label={`${index + 1}番・${risk.adultName ?? risk.name}の説明を表示`} className={`absolute grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-[3px] border-white font-bold text-ink shadow-lg focus-visible:outline-4 focus-visible:outline-white ${active ? "z-20 scale-110 bg-primary" : "z-10 bg-surface"}`} style={{ left: `clamp(22px, calc(${risk.x}% + ${offsetX}px), calc(100% - 22px))`, top: `clamp(22px, calc(${risk.y}% + ${offsetY}px), calc(100% - 22px))`, boxShadow: active ? `0 0 0 4px ${RISK_KINDS[risk.kind].accent}` : undefined }}>{index + 1}</button>;
        })}
      </div>
      <p className="px-4 pt-3 text-11 text-ink-soft">番号の位置は目安です。近い番号は押せるように少しずらして表示します。</p>
      {!confirmed.length && <p className="p-4 text-13">確認済みの危険候補はありません。室内の安全を保証するものではありません。通路や家具の固定状態を実際に確認してください。</p>}
      {confirmed.length > 0 && <div className="flex gap-2 overflow-x-auto px-4 py-3" aria-label="危険箇所の一覧">
        {confirmed.map((risk, index) => <button key={risk.id} type="button" aria-pressed={selected?.id === risk.id} aria-controls="selected-risk-explanation" onClick={() => setSelectedId(risk.id)} className={`min-h-11 shrink-0 rounded-pill border px-3 text-13 font-bold ${selected?.id === risk.id ? "border-primary-mid bg-primary-soft text-primary-ink" : "border-border bg-surface text-ink"}`}>{index + 1}. <Furigana text={risk.name} adult={risk.adultName} /></button>)}
      </div>}
      {selected && selectedAdvice && specific && <article id="selected-risk-explanation" className="border-t border-border p-4" aria-live="polite">
            <p className="text-11 font-bold" style={{ color: RISK_KINDS[selected.kind].text }}>{RISK_KINDS[selected.kind].label}</p>
            <h3 className="mt-1 font-display text-lg font-bold">{selectedIndex + 1}. <Furigana text={selected.name} adult={selected.adultName} /></h3>
            <p className="mt-2 text-13 text-ink-muted"><Furigana text={selectedAdvice.childDanger} adult={selectedAdvice.danger} /></p>
            <div className="mt-3 rounded-field bg-primary-soft p-3">
              <p className="text-11 text-primary-ink">地震前に・大人と一緒に</p>
              <p className="mt-1 font-bold"><Furigana text={specific.headline} /></p>
              <ol className="mt-2 space-y-2">
                {specific.steps.map((text, i) => <li key={text} className="flex gap-2 text-13"><span className="font-bold text-primary-ink">{i + 1}</span><Furigana text={text} /></li>)}
              </ol>
            </div>
            {specific.detail && <div className="mt-3 rounded-field bg-canvas p-3">
              <h3 className="min-h-6 text-13 font-bold"><Furigana text="対策[たいさく]のポイント" adult="対策の詳細・注意点" /></h3>
              <p className="mt-2 text-base leading-relaxed"><Furigana text={specific.detail} /></p>
            </div>}
            <div className="mt-3"><SafetyProducts risks={[selected]} /></div>
      </article>}
      <div className="border-t border-border p-4">
        <a href="https://www.tfd.metro.tokyo.lg.jp/learning/elib/kagutenhandbook.html" target="_blank" rel="noopener noreferrer" className="text-11 underline">対策の参考：東京消防庁 家具類の転倒・落下・移動防止対策 ↗</a>
        <button type="button" aria-expanded={showAftermath} aria-controls="aftermath-preview" onClick={() => { setOpenedOnce(true); setShowAftermath(!showAftermath); }} className="mt-4 min-h-11 w-full rounded-pill border border-border px-3 text-13 font-bold">
          <Furigana text={showAftermath ? "予想図[よそうず]を閉[と]じる" : "地震[じしん]のあとの様子[ようす]を見[み]る"} adult={showAftermath ? "予測画像を閉じる" : "地震後の様子を見る（予測画像）"} />
        </button>
        <div id="aftermath-preview" hidden={!showAftermath} className="mt-3">{openedOnce && <AftermathCard photoUrl={photoUrl} risks={risks} />}</div>
      </div>
    </section>
  );
}
