"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import roomRisk from "@/../public/figma/img/room-risk.jpg";
import { Button } from "@/components/ui/Button";
import { Furigana, plain } from "@/components/ui/Furigana";
import { DisclaimerFooter } from "@/components/ui/Screen";
import { type RiskKind, type RoomObjectType } from "@/lib/content";
import { getSession, useSession } from "@/lib/session";
import { prepareAftermath } from "@/lib/room-preparation";
import { focusDescription } from "@/lib/focus-description";
import { RoomTiming } from "@/components/RoomTiming";

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
  { value: "other", label: "その他", kind: "fall" },
];

export default function RoomRecognitionPage() {
  const router = useRouter();
  const { risks, photoUrl, analysisSource, analysisWarning, update } = useSession();
  const [editing, setEditing] = useState<string | null>(null);
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
      risks: prev.risks.map((risk) => risk.id === editing ? {
        ...risk,
        name,
        adultName: name,
        objectType: draft.objectType,
        kind: draft.objectType === risk.objectType ? risk.kind : OBJECTS.find((object) => object.value === draft.objectType)!.kind,
        confidence: undefined,
      } : risk),
    }));
    setEditing(null);
  };

  const start = () => {
    if (analysisSource === "ai") void prepareAftermath(photoUrl, risks);
    // confirmed は既存の出題・結果の対象フラグ。危険性への同意は求めない。
    update((prev) => ({
      ...prev,
      risks: prev.risks.map((risk) => ({ ...risk, confirmed: true })),
      questions: [],
      answers: [],
      finishedAt: null,
    }));
    router.push("/quiz");
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <main className="flex flex-1 flex-col gap-4 px-5 py-4">
        <div>
          <p className="text-11 font-bold text-primary-ink">体験の準備</p>
          <h1 className="mt-2 font-display text-xl font-bold"><Furigana text="こんな部屋[へや]だね" adult="部屋を読み取りました" /></h1>
          <p className="mt-2 text-13 text-ink-muted"><Furigana text="このまま体験[たいけん]を始[はじ]められるよ。名前[なまえ]がちがうものだけ、直[なお]してね。" adult="そのまま体験を始められます。認識が違うものだけ、必要に応じて修正してください。" /></p>
        </div>
        {analysisSource === "demo" && <p role="status" className="rounded-field bg-warn-soft p-3 text-11 text-warn">{analysisWarning ?? "サンプルの部屋で体験できます。"}</p>}
        <RoomTiming />
        <div className="relative overflow-hidden rounded-panel bg-ink">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="体験に使う部屋" className="block h-auto w-full" />
          ) : <Image src={roomRisk} alt="サンプルの部屋" className="h-auto w-full" />}
          {risks.map((risk, index) => (
            <button key={risk.id} type="button" aria-label={`${index + 1}番・${plain(risk.name)}の説明へ移動`} aria-controls={`room-object-${index}`} onClick={() => focusDescription(`room-object-${index}`)} className="absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-primary font-bold text-ink shadow focus-visible:outline-4 focus-visible:outline-white" style={{ left: `${risk.x}%`, top: `${risk.y}%` }}>{index + 1}</button>
          ))}
        </div>
        <p className="text-11 text-ink-muted"><Furigana text="番号[ばんごう]を押[お]すと、その場所[ばしょ]の説明[せつめい]に移動[いどう]するよ。" /></p>
        <section className="rounded-panel bg-surface p-4">
          <h2 className="font-display text-sm font-bold"><Furigana text="見[み]つけた家具[かぐ]や場所[ばしょ]" /></h2>
          <ul className="mt-3 flex flex-col gap-2">
            {risks.map((risk, index) => (
              <li key={risk.id} id={`room-object-${index}`} tabIndex={-1} className="scroll-mt-6 rounded-field bg-canvas p-3 focus:bg-primary-soft focus:outline-2 focus:outline-primary-mid">
                {editing === risk.id ? (
                  <form onSubmit={save} className="flex flex-col gap-2">
                    <label htmlFor="object-name" className="text-13">名前</label>
                    <input id="object-name" autoFocus maxLength={40} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="min-h-11 rounded-field border border-border bg-surface px-3" />
                    <label htmlFor="object-type" className="text-13">何が写っていますか？</label>
                    <select id="object-type" value={draft.objectType} onChange={(event) => setDraft({ ...draft, objectType: event.target.value as RoomObjectType })} className="min-h-11 rounded-field border border-border bg-surface px-3">
                      {OBJECTS.map((object) => <option key={object.value} value={object.value}>{object.label}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <Button size="md" type="button" variant="outline" onClick={() => setEditing(null)}>キャンセル</Button>
                      <Button size="md" type="submit" disabled={!draft.name.trim()}>保存</Button>
                    </div>
                    <button type="button" className="min-h-11 text-13 text-ink-muted underline" onClick={() => {
                      update((prev) => ({ ...prev, risks: prev.risks.filter((item) => item.id !== risk.id) }));
                      setEditing(null);
                    }}>これは写っていない（一覧から外す）</button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-13 font-bold text-primary-ink">{index + 1}</span>
                    <p className="min-w-0 flex-1 text-13 font-bold"><Furigana text={risk.name} adult={risk.adultName} /></p>
                    <button type="button" aria-label={`${plain(risk.name)}の認識を修正`} className="min-h-11 px-3 text-13 text-primary-ink underline" onClick={() => {
                      setEditing(risk.id);
                      setDraft({ name: plain(risk.name), objectType: risk.objectType ?? "other" });
                    }}>修正</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {risks.length === 0 && <p className="mt-3 text-13 text-ink-muted">家具や場所を読み取れませんでした。共通の問題で体験するか、写真を撮り直せます。</p>}
        </section>
        <div className="sticky bottom-0 mt-auto flex flex-col gap-2 bg-canvas py-3">
          <Button onClick={start} disabled={editing !== null}><Furigana text="このまま体験[たいけん]を始[はじ]める" adult="シミュレーションを始める" /></Button>
          <button type="button" onClick={() => router.push("/camera")} className="min-h-11 text-13 text-ink-muted underline">写真を撮り直す</button>
        </div>
      </main>
      <DisclaimerFooter />
    </div>
  );
}
