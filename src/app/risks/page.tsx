"use client";

import Image from "next/image";
import { DetailSheet } from "@/components/ui/DetailSheet";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import roomRisk from "@/../public/figma/img/room-risk.jpg";
import { Button } from "@/components/ui/Button";
import { Furigana, plain } from "@/components/ui/Furigana";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
import { type Risk, type RiskKind, type RoomObjectType } from "@/lib/content";
import { getSession, useSession } from "@/lib/session";
import { viewForRisk, riskOnView, groupRisksByView } from "@/lib/room-views";
import { focusDescription } from "@/lib/focus-description";
import { SafetyProducts } from "@/components/SafetyProducts";
import { RISK_KINDS } from "@/lib/content";
import { useSettings } from "@/lib/settings";
import { roomAdviceImages, roomAdvice } from "@/lib/room-guidance";

function AdviceIllustration({ risk }: { risk: Risk }) {
  const [variant] = useState(() => Math.random());
  const image = roomAdviceImages(risk, variant)[0];
  return image ? <Image src={image.src} alt={image.alt} width={1536} height={1024} className="mx-auto mt-3 h-auto max-h-56 w-auto max-w-[88%] rounded-field object-contain" /> : null;
}

const DANGER_TEXT: Record<RiskKind, { child: string; adult: string }> = {
  fall: { child: "たおれたり落[お]ちたりして、けがや逃[に]げ道[みち]をふさぐ原因[げんいん]になる可能性[かのうせい]があります。", adult: "転倒・落下により負傷したり、避難経路を塞いだりする可能性があります。" },
  break: { child: "われた破片[はへん]でけがをしたり、安全[あんぜん]に歩[ある]けなくなったりする可能性[かのうせい]があります。", adult: "破損した破片で負傷したり、安全に移動できなくなったりする可能性があります。" },
  block: { child: "ものが動[うご]いたり散[ち]らばったりして、出口[でぐち]を通[とお]れなくなる可能性[かのうせい]があります。", adult: "物が散乱・移動すると、出入口や避難経路が塞がれる可能性があります。" },
};

const OBJECTS: { value: RoomObjectType; label: string; kind: RiskKind }[] = [
  { value: "bookshelf", label: "本棚", kind: "fall" },
  { value: "cupboard", label: "食器棚", kind: "fall" },
  { value: "elevated_objects", label: "棚の上・高い所のもの", kind: "fall" },
  { value: "tall_furniture", label: "背の高い家具・収納", kind: "fall" },
  { value: "tv", label: "テレビ", kind: "fall" },
  { value: "window", label: "窓・ガラス", kind: "break" },
  { value: "doorway", label: "ドア・出入り口", kind: "block" },
  { value: "hanging_object", label: "吊り下げたもの", kind: "fall" },
  { value: "desk", label: "机・テーブル", kind: "fall" },
  { value: "bed", label: "ベッド", kind: "fall" },
  { value: "loose_objects", label: "床に置いてあるもの", kind: "block" },
  { value: "instrument", label: "楽器", kind: "fall" },
  { value: "clothes_rack", label: "衣類・バッグのラック", kind: "fall" },
  { value: "pet_cage", label: "ペットのケージ", kind: "fall" },
  { value: "washing_machine", label: "洗濯機", kind: "fall" },
  { value: "other", label: "その他", kind: "fall" },
];

export default function RoomRecognitionPage() {
  const router = useRouter();
  const { audience } = useSettings();
  const { risks: sessionRisks, photoUrl, roomViews = [], analysisSource, analysisWarning, checked, toggleChecked, update } = useSession();
  const risks = groupRisksByView(sessionRisks, roomViews);
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);
  const allReviewed = risks.every(risk => reviewedIds.includes(risk.id));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = risks.find((risk) => risk.id === selectedId) ?? risks[0];
  const selectedIndex = selected ? risks.indexOf(selected) : -1;
  const viewIndex = viewForRisk(selected, roomViews);
  const currentView = roomViews[viewIndex];
  const shownPhoto = currentView?.url ?? photoUrl;
  const shownRisk = selected && currentView ? riskOnView(selected, currentView) : selected;
  const visibleRisks = risks.flatMap((risk, number) => !currentView || viewForRisk(risk, roomViews) === viewIndex
    ? [{ risk: currentView ? riskOnView(risk, currentView) : risk, number }] : []);
  const selectedAdvice = selected ? roomAdvice(selected, audience) : null;
  const [editing, setEditing] = useState<string | null>(null);
  const [editNotice, setEditNotice] = useState("");
  const beginEdit = (risk: Risk) => {
    setEditing(risk.id);
    setSelectedId(risk.id);
    setReviewedIds((ids) => ids.includes(risk.id) ? ids : [...ids, risk.id]);
    setDraft({ name: plain(risk.name), objectType: risk.objectType ?? "other" });
    setEditNotice("");
  };
  const [draft, setDraft] = useState({ name: "", objectType: "other" as RoomObjectType });
  const selectRisk = (riskId: string) => {
    setEditing(null);
    setSelectedId(riskId);
    setReviewedIds((ids) => ids.includes(riskId) ? ids : [...ids, riskId]);
  };

  useEffect(() => {
    if (!getSession().analysisSource) router.replace("/analyzing");
  }, [router]);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const name = draft.name.trim();
    if (!name) return;
    update((prev) => ({
      ...prev,
      checked: prev.checked.filter(key => key !== `prepared:${editing}`),
      risks: prev.risks.map((risk) => risk.id === editing ? {
        ...risk,
        name,
        adultName: name,
        objectType: draft.objectType,
        kind: draft.objectType === risk.objectType ? risk.kind : OBJECTS.find((object) => object.value === draft.objectType)!.kind,
        confidence: undefined,
      } : risk),
    }));
    setReviewedIds(ids => ids.filter(id => id !== editing));
    setEditNotice(`「${name}」に修正しました。`);
  };

  const start = () => {
    // confirmed は既存の出題・結果の対象フラグ。危険性への同意は求めない。
    update((prev) => ({
      ...prev,
      risks: groupRisksByView(prev.risks, prev.roomViews ?? []).map((risk) => ({ ...risk, confirmed: true })),
      questions: [],
      answers: [],
      finishedAt: null,
    }));
    router.push("/quiz");
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <StatusBar />
      <main className="flex flex-1 flex-col gap-3 px-5 py-3">
        <div>
          <p className="text-11 font-bold text-primary-ink"><Furigana text={"体験の準備"} /></p>
          <h1 className="mt-2 font-display text-xl font-bold"><Furigana text="部屋[へや]の危険[きけん]を確認[かくにん]しよう" adult="室内の危険候補を確認" /></h1>
          <p className="mt-2 text-13 text-ink-muted"><Furigana text="写真[しゃしん]の番号[ばんごう]を押[お]して、危険[きけん]と備[そな]えを確認[かくにん]しよう。" adult="写真の番号を選ぶと、危険の理由と対策を確認できます。" /></p>
        </div>
        {analysisSource === "demo" && <p role="status" className="rounded-field bg-warn-soft p-3 text-11 text-warn">{analysisWarning ?? "サンプルの部屋で体験できます。"}</p>}
        <DetailSheet title="認識を修正する" onOpenChange={open => { if (open && selected) beginEdit(selected); else setEditing(null); }} summary={`写真の番号と見比べて、名前・種類を直す（${risks.length}か所）`}>
        <section>
          <p className="text-13 text-ink-muted">直したい番号を選んでください。写真の枠が修正する対象です。</p>
          <div aria-label="修正する対象" className="mt-3 flex flex-wrap gap-2">
            {risks.map((risk, index) => <button key={risk.id} type="button" aria-pressed={editing === risk.id} onClick={() => beginEdit(risk)} className={`min-h-11 rounded-field border px-3 text-13 font-bold ${editing === risk.id ? "border-primary-mid bg-primary-soft text-primary-ink" : "border-border bg-surface"}`}>{index + 1}. <Furigana text={risk.name} adult={risk.adultName} /></button>)}
          </div>
          {editNotice && <p role="status" className="mt-3 rounded-field bg-secondary-soft p-3 text-13 font-bold text-secondary-ink">{editNotice}</p>}
          <ul className="mt-3 flex flex-col gap-2">
            {risks.map((risk, index) => editing === risk.id && (
              <li key={risk.id} id={`room-object-${index}`} tabIndex={-1} className="scroll-mt-6 rounded-field bg-canvas p-3 focus:bg-primary-soft focus:outline-2 focus:outline-primary-mid">
                  <form onSubmit={save} className="flex flex-col gap-2">
                    <div className="rounded-field bg-secondary-soft p-3">
                      <p className="text-11 font-bold text-secondary-ink">いま修正している対象</p>
                      <h3 className="mt-1 text-base font-bold">{index + 1}. <Furigana text={risk.name} adult={risk.adultName} /></h3>
                    </div>
                    <div className="relative overflow-hidden rounded-field bg-ink">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl ?? roomRisk.src} alt={`${index + 1}番・${plain(risk.name)}の位置を確認する部屋の写真`} className="block h-auto w-full" />
                      {risk.bounds && <span aria-hidden className="pointer-events-none absolute rounded-field border-[3px] border-primary bg-primary/15" style={{ left: `${risk.bounds.x}%`, top: `${risk.bounds.y}%`, width: `${risk.bounds.w}%`, height: `${risk.bounds.h}%` }} />}
                      <span aria-hidden className="absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-primary font-bold text-ink" style={{ left: `${risk.x}%`, top: `${risk.y}%` }}>{index + 1}</span>
                    </div>
                    <label htmlFor="object-name" className="text-13"><Furigana text={"名前"} /></label>
                    <input id="object-name" maxLength={40} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="min-h-11 rounded-field border border-border bg-surface px-3" />
                    <label htmlFor="object-type" className="text-13"><Furigana text={"何が写っていますか？"} /></label>
                    <select id="object-type" value={draft.objectType} onChange={(event) => setDraft({ ...draft, objectType: event.target.value as RoomObjectType })} className="min-h-11 rounded-field border border-border bg-surface px-3">
                      {OBJECTS.map((object) => <option key={object.value} value={object.value}>{object.label}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <Button size="md" type="button" variant="outline" onClick={event => event.currentTarget.closest("dialog")?.close()}>キャンセル</Button>
                      <Button size="md" type="submit" disabled={!draft.name.trim()}><Furigana text={"保存"} /></Button>
                    </div>
                    <button type="button" className="min-h-11 text-13 text-ink-muted underline" onClick={() => {
                      update((prev) => ({ ...prev, risks: prev.risks.filter((item) => item.id !== risk.id) }));
                      setEditing(null);
                      setEditNotice("対象を一覧から外しました。続ける場合は別の番号を選んでください。");
                    }}><Furigana text={"これは写っていない（一覧から外す）"} /></button>
                  </form>
              </li>
            ))}
          </ul>
          {risks.length === 0 && <p className="mt-3 text-13 text-ink-muted">家具や場所を読み取れませんでした。共通の問題で体験するか、写真を撮り直せます。</p>}
        </section>
        </DetailSheet>
        <div id="selected-room-photo" tabIndex={-1} className="scroll-mt-16 overflow-hidden rounded-panel bg-ink">
        <div className="relative">
          {shownPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shownPhoto} alt={currentView ? `部屋の写真 ${viewIndex + 1} / ${roomViews.length}` : "体験に使う部屋"} className="block h-auto w-full" />
          ) : <Image src={roomRisk} alt="サンプルの部屋" className="h-auto w-full" />}
          {shownRisk?.bounds && <div aria-hidden className="pointer-events-none absolute rounded-field border-[3px] border-primary" style={{ left: `${shownRisk.bounds.x}%`, top: `${shownRisk.bounds.y}%`, width: `${shownRisk.bounds.w}%`, height: `${shownRisk.bounds.h}%` }} />}
          {visibleRisks.map(({ risk, number }, index) => {
            const active = selected?.id === risk.id;
            const nearby = visibleRisks.slice(0, index).map(item => item.risk).filter((other) => Math.hypot(other.x - risk.x, other.y - risk.y) < 12).length;
            const offsets = [[0, 0], [24, -24], [-24, 24], [24, 24], [-24, -24]];
            const [dx, dy] = offsets[nearby % offsets.length];
            const reviewed = reviewedIds.includes(risk.id);
            return <button key={risk.id} type="button" aria-pressed={active} aria-label={`${number + 1}番・${plain(risk.name)}の説明を表示${reviewed ? "・確認済み" : ""}`} onClick={() => selectRisk(risk.id)} className={`absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white font-bold text-ink shadow ${active ? "z-20 bg-primary" : reviewed ? "z-10 bg-safe-soft" : "z-10 bg-surface"}`} style={{ left: `clamp(24px, calc(${risk.x}% + ${dx}px), calc(100% - 24px))`, top: `clamp(24px, calc(${risk.y}% + ${dy}px), calc(100% - 24px))` }}>{number + 1}{reviewed && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-safe text-[0.625rem] text-white">✓</span>}</button>;
          })}
          {roomViews.length > 1 && <p className="absolute left-2 top-2 rounded-chip bg-black/70 px-2 py-1 text-xs font-bold text-white"><Furigana text={`写真 ${viewIndex + 1} / ${roomViews.length}`} /></p>}
        </div>
        {selected && <div className="relative flex items-center gap-2 bg-ink px-2 py-0 text-white">
          <button type="button" aria-label="前の物体を表示" disabled={selectedIndex === 0} onClick={() => selectRisk(risks[selectedIndex - 1].id)} className="size-11 shrink-0 disabled:opacity-30">←</button>
          <p aria-live="polite" className="min-w-0 flex-1 truncate text-center text-sm font-bold">{selectedIndex + 1} / {risks.length} · <Furigana text={selected.name} adult={selected.adultName} /></p>
          <button type="button" aria-label="次の物体を表示" disabled={selectedIndex === risks.length - 1} onClick={() => selectRisk(risks[selectedIndex + 1].id)} className="size-11 shrink-0 disabled:opacity-30">→</button>
        </div>}
        </div>
        {selected && selectedAdvice && <article className="rounded-panel bg-surface p-4" aria-live="polite">
          <p className="text-11 font-bold" style={{ color: RISK_KINDS[selected.kind].text }}><Furigana text={RISK_KINDS[selected.kind].label} /></p>
          <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="mt-1 font-display text-lg font-bold">{selectedIndex + 1}. <Furigana text={selected.name} adult={selected.adultName} /></h2>
          </div>
          <p className="mt-2 text-13 leading-relaxed text-ink-muted"><Furigana text={DANGER_TEXT[selected.kind].child} adult={DANGER_TEXT[selected.kind].adult} /></p>
          <p className="mt-2 text-sm font-bold text-secondary-ink"><Furigana text={selectedAdvice.headline} /></p>
          <AdviceIllustration key={selected.id} risk={selected} />
          <div className="mt-3"><DetailSheet key={selected.id} title="対策の手順・注意点" summary="具体的な備え方と対策グッズ">
          <div className="mt-3 rounded-field bg-secondary-soft p-3">
            <p className="text-11 font-bold text-secondary-ink"><Furigana text="地震[じしん]の前[まえ]にできること" adult="事前にできる対策" /></p>
            <p className="mt-1 font-display text-15 font-bold"><Furigana text={selectedAdvice.headline} /></p>
            <ol className="mt-2 space-y-2">
              {selectedAdvice.steps.map((text, index) => <li key={text} className="flex gap-2 text-13"><span className="font-bold text-secondary-ink">{index + 1}</span><Furigana text={text} /></li>)}
            </ol>
          </div>
          {selectedAdvice.detail && <div className="mt-3 rounded-field bg-canvas p-3">
            <h3 className="min-h-8 text-13 font-bold"><Furigana text="対策[たいさく]のポイント" adult="対策の詳細・注意点" /></h3>
            {selectedAdvice.detail && <p className="mt-2 text-base leading-relaxed"><Furigana text={selectedAdvice.detail} /></p>}
          </div>}
          <SafetyProducts risks={[{ ...selected, confirmed: true }]} />
          </DetailSheet></div>
          <label className="mt-4 flex min-h-12 cursor-pointer items-center gap-3 rounded-field border border-safe p-3 font-bold text-safe">
            <input type="checkbox" checked={checked.includes(`prepared:${selected.id}`)} onChange={() => toggleChecked(`prepared:${selected.id}`)} className="size-5 accent-teal-700" />
            <Furigana text="この家具・場所は対策[たいさく]済[ず]み" adult="この家具・場所は対策済み" />
          </label>
        </article>}
        {!allReviewed && selected && <div className="space-y-2 py-3">
          <p className="text-center text-sm text-ink-muted"><Furigana text={`確認済み ${risks.filter(r => reviewedIds.includes(r.id)).length} / ${risks.length}`} /></p>
          <Button size="md" onClick={() => {
            const nextReviewed = [...new Set([...reviewedIds, selected.id])];
            setReviewedIds(nextReviewed);
            const next = risks.find(r => !nextReviewed.includes(r.id));
            if (next) { setSelectedId(next.id); focusDescription("selected-room-photo"); }
          }}><Furigana text={risks.filter(r => !reviewedIds.includes(r.id) && r.id !== selected.id).length ? "次の家具を確認" : "確認を終える"} /></Button>
        </div>}
        {allReviewed && <section className="space-y-3 rounded-panel bg-secondary-soft p-4">
          <h2 className="text-lg font-bold"><Furigana text="この部屋で、地震が起きたら？" /></h2>
          <p className="text-base leading-relaxed"><Furigana text="部屋の備えを確認できました。次は、揺れている間と収まった後の行動を体験しよう。" /></p>
          <Button size="md" onClick={start}><Furigana text="行動クイズへ" /></Button>
        </section>}
        <div className="flex flex-col py-2">
          <button type="button" onClick={() => router.push("/camera")} className="min-h-11 text-13 text-ink-muted underline">写真を撮り直す</button>
        </div>
      </main>
      <DisclaimerFooter />
    </div>
  );
}
