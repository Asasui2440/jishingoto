"use client";

import Image from "next/image";
import { DetailSheet } from "@/components/ui/DetailSheet";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import roomRisk from "@/../public/figma/img/room-risk.jpg";
import { Button } from "@/components/ui/Button";
import { Furigana, plain } from "@/components/ui/Furigana";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
import { type Risk, type RiskKind, type RoomObjectType } from "@/lib/content";
import { getSession, useSession } from "@/lib/session";
import { viewForRisk, riskOnView, groupRisksByView } from "@/lib/room-views";
import { focusDescription } from "@/lib/focus-description";
import { aftermathInput } from "@/lib/aftermath-plan";
import { prepareAftermath } from "@/lib/room-preparation";
import { SafetyProducts } from "@/components/SafetyProducts";
import { RISK_KINDS } from "@/lib/content";
import { useSettings } from "@/lib/settings";
import { roomAdviceImages, roomAdvice } from "@/lib/room-guidance";
import styles from "./risks.module.css";

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
  const { risks: sessionRisks, roomViews = [], photoUrl, analysisSource, analysisWarning, update } = useSession();
  const risks = groupRisksByView(sessionRisks, roomViews);
  const [reviewedIds, setReviewedIds] = useState<string[]>([]);
  const reviewedCount = risks.filter(risk => reviewedIds.includes(risk.id)).length;
  const allReviewed = reviewedCount === risks.length;
  const completionDialog = useRef<HTMLDialogElement>(null);
  const [showCompletion, setShowCompletion] = useState(false);

  useEffect(() => {
    const dialog = completionDialog.current;
    if (!showCompletion || !dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, [showCompletion]);
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
    setDraft({ name: plain(risk.name), objectType: risk.objectType ?? "other" });
    setEditNotice("");
  };
  const [draft, setDraft] = useState({ name: "", objectType: "other" as RoomObjectType });

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

  // 写真の矢印・番号・下部ボタンは、いま見ている項目を確認してから移動する。
  const reviewAndSelect = (riskId?: string, scrollToPhoto = false) => {
    if (!selected) return;
    const nextReviewed = [...new Set([...reviewedIds, selected.id])];
    setReviewedIds(nextReviewed);
    setEditing(null);
    const nextId = riskId ?? risks.find(risk => !nextReviewed.includes(risk.id))?.id;
    if (nextId) {
      setSelectedId(nextId);
      if (scrollToPhoto) focusDescription("selected-room-photo");
    }
    if (risks.every(risk => nextReviewed.includes(risk.id)) && (!allReviewed || !nextId)) {
      setShowCompletion(true);
    }
  };
  const nextRiskId = risks[selectedIndex + 1]?.id;
  const finishOnNext = !nextRiskId && !risks.some(risk => risk.id !== selected?.id && !reviewedIds.includes(risk.id));


  const start = () => {
    // confirmed は既存の出題・結果の対象フラグ。危険性への同意は求めない。
    update((prev) => ({
      ...prev,
      risks: groupRisksByView(prev.risks, prev.roomViews ?? []).map((risk) => ({ ...risk, confirmed: true })),
      questions: [],
      answers: [],
      finishedAt: null,
      resultStep: 0,
      resultIntroPending: false,
    }));
    const session = getSession();
    const prediction = aftermathInput(session);
    void prepareAftermath(prediction.photo, prediction.risks);
    router.push("/quiz");
  };

  return (
    <div className={styles.page}>
      <StatusBar />
      <main className={styles.content}>
        <div>
          <p className="text-11 font-bold text-primary-ink">体験の準備</p>
          <h1 className="mt-2 font-display text-xl font-bold"><Furigana text="部屋[へや]の危険[きけん]を確認[かくにん]しよう" adult="室内の危険候補を確認" /></h1>
          <p className="mt-2 text-sm leading-relaxed"><Furigana text="危険[きけん]と備[そな]えを読[よ]んだら、矢印[やじるし]で次[つぎ]へ。移動[いどう]すると確認[かくにん]済[ず]みになります。" adult="危険の理由と対策を読んだら、矢印で次へ。移動すると確認済みになります。" /></p>
          <p className="mt-1 text-13 font-bold text-secondary-ink"><Furigana text={`全部[ぜんぶ]で${risks.length}か所[しょ]。すべて確認[かくにん]すると、行動[こうどう]クイズへ進[すす]めます。`} /></p>
        </div>
        {analysisSource === "demo" && <p role="status" className="rounded-field bg-warn-soft p-3 text-11 text-warn">{analysisWarning ?? "サンプルの部屋で体験できます。"}</p>}

        <div className={styles.review}>
        <div id="selected-room-photo" tabIndex={-1} className={styles.photo}>
        {selected && <p aria-live="polite" className={styles.photoCaption}>{selectedIndex + 1} / {risks.length} · <Furigana text={selected.name} adult={selected.adultName} />{reviewedIds.includes(selected.id) && " · ✓ 確認済み"}</p>}
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
            return <button key={risk.id} type="button" aria-pressed={active} aria-label={`${number + 1}番・${plain(risk.name)}の説明を表示${reviewed ? "・確認済み" : ""}`} onClick={() => { if (risk.id !== selected?.id) reviewAndSelect(risk.id); }} className={`absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white font-bold text-ink shadow ${active ? "z-20 bg-primary" : reviewed ? "z-10 bg-safe-soft" : "z-10 bg-surface"}`} style={{ left: `clamp(24px, calc(${risk.x}% + ${dx}px), calc(100% - 24px))`, top: `clamp(24px, calc(${risk.y}% + ${dy}px), calc(100% - 24px))` }}>{number + 1}{reviewed && <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-safe text-[0.625rem] text-white">✓</span>}</button>;
          })}
          {selected && <>
            <button type="button" aria-label="確認して前へ" disabled={selectedIndex === 0} onClick={() => reviewAndSelect(risks[selectedIndex - 1].id)} className={`${styles.arrowButton} ${styles.previous}`}>
              <svg aria-hidden viewBox="0 0 24 24"><path d="m15 4-8 8 8 8" /></svg>
              <Furigana text="前[まえ]へ" />
            </button>
            <button type="button" aria-label={finishOnNext ? "確認を終える" : "確認して次へ"} onClick={() => reviewAndSelect(nextRiskId)} className={`${styles.arrowButton} ${styles.next}`}>
              {finishOnNext ? <svg aria-hidden viewBox="0 0 24 24"><path d="m4 12 5 5L20 6" /></svg> : <svg aria-hidden viewBox="0 0 24 24"><path d="m9 4 8 8-8 8" /></svg>}
              <Furigana text={finishOnNext ? "完了[かんりょう]" : "次[つぎ]へ"} />
            </button>
          </>}
          {roomViews.length > 1 && <p className="absolute left-2 top-2 rounded-chip bg-black/70 px-2 py-1 text-xs font-bold text-white"><Furigana text={`写真 ${viewIndex + 1} / ${roomViews.length}`} /></p>}
        </div>

        </div>
        {selected && selectedAdvice && <article className="rounded-panel bg-surface p-4" aria-live="polite">
          <p className="text-11 font-bold" style={{ color: RISK_KINDS[selected.kind].text }}><Furigana text={RISK_KINDS[selected.kind].label} /></p>
          <h2 className="mt-1 font-display text-lg font-bold">{selectedIndex + 1}. <Furigana text={selected.name} adult={selected.adultName} /></h2>
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
        </article>}
        </div>
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
                      <img src={shownPhoto ?? roomRisk.src} alt={`${index + 1}番・${plain(risk.name)}の位置を確認する部屋の写真`} className="block h-auto w-full" />
                      {shownRisk?.bounds && <span aria-hidden className="pointer-events-none absolute rounded-field border-[3px] border-primary bg-primary/15" style={{ left: `${shownRisk.bounds.x}%`, top: `${shownRisk.bounds.y}%`, width: `${shownRisk.bounds.w}%`, height: `${shownRisk.bounds.h}%` }} />}
                      <span aria-hidden className="absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-primary font-bold text-ink" style={{ left: `${shownRisk?.x ?? risk.x}%`, top: `${shownRisk?.y ?? risk.y}%` }}>{index + 1}</span>
                    </div>
                    <label htmlFor="object-name" className="text-13">名前</label>
                    <input id="object-name" maxLength={40} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="min-h-11 rounded-field border border-border bg-surface px-3" />
                    <label htmlFor="object-type" className="text-13">何が写っていますか？</label>
                    <select id="object-type" value={draft.objectType} onChange={(event) => setDraft({ ...draft, objectType: event.target.value as RoomObjectType })} className="min-h-11 rounded-field border border-border bg-surface px-3">
                      {OBJECTS.map((object) => <option key={object.value} value={object.value}>{object.label}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <Button size="md" type="button" variant="outline" onClick={event => event.currentTarget.closest("dialog")?.close()}>キャンセル</Button>
                      <Button size="md" type="submit" disabled={!draft.name.trim()}>保存</Button>
                    </div>
                    <button type="button" className="min-h-11 text-13 text-ink-muted underline" onClick={() => {
                      update((prev) => ({ ...prev, risks: prev.risks.filter((item) => item.id !== risk.id) }));
                      setEditing(null);
                      setEditNotice("対象を一覧から外しました。続ける場合は別の番号を選んでください。");
                    }}>これは写っていない（一覧から外す）</button>
                  </form>
              </li>
            ))}
          </ul>
          {risks.length === 0 && <p className="mt-3 text-13 text-ink-muted">家具や場所を読み取れませんでした。共通の問題で体験するか、写真を撮り直せます。</p>}
        </section>
        </DetailSheet>
        <div className="flex flex-col py-2">
          <button type="button" onClick={() => router.push("/camera")} className="min-h-11 text-13 text-ink-muted underline">写真を撮り直す</button>
        </div>
        <DisclaimerFooter />
      </main>
      <section aria-label="確認の進み具合" inert={showCompletion} className={styles.actions}>
        <div className={styles.progressLabel} aria-live="polite">
          <p className="font-bold">{risks.length === 0 ? "確認する家具・場所がありません" : allReviewed ? "✓ すべて確認できました！" : `確認済み ${reviewedCount} / ${risks.length}`}</p>
          {!allReviewed && <span>あと{risks.length - reviewedCount}か所</span>}
        </div>
        {risks.length > 0 && <progress className={styles.progress} value={reviewedCount} max={risks.length} aria-label="家具・場所の確認状況" />}
        {!allReviewed && selected ? <Button onClick={() => reviewAndSelect(nextRiskId, true)}>
          <span aria-hidden>✓</span>
          <Furigana text={finishOnNext ? "確認[かくにん]を終[お]える" : "次[つぎ]へ"} />
          <span aria-hidden className="text-2xl">→</span>
        </Button> : <Button onClick={start}><Furigana text="行動[こうどう]クイズへ" /><span aria-hidden className="text-2xl">→</span></Button>}
      </section>
      <dialog ref={completionDialog} aria-labelledby="risk-completion-title" aria-describedby="risk-completion-description" className={styles.completion} onClose={() => setShowCompletion(false)}>
        <div aria-hidden className={styles.completionCheck}>✓</div>
        <p className="text-sm font-bold text-secondary-ink">{risks.length} / {risks.length} か所 確認完了</p>
        <h2 id="risk-completion-title" className="mt-2 text-xl font-bold"><Furigana text="すべて確認[かくにん]できました！" /></h2>
        <p id="risk-completion-description" className="my-4 text-sm leading-relaxed"><Furigana text="次[つぎ]は、この部屋[へや]で地震[じしん]が起[お]きたらどう動[うご]くか、クイズで体験[たいけん]しよう。" /></p>
        <Button autoFocus onClick={start}><Furigana text="行動[こうどう]クイズへ" /><span aria-hidden className="text-2xl">→</span></Button>
        <button type="button" onClick={() => completionDialog.current?.close()} className="mt-3 min-h-11 w-full text-sm font-bold text-ink-muted underline"><Furigana text="もう一度[いちど]見[み]る" /></button>
      </dialog>
    </div>
  );
}
