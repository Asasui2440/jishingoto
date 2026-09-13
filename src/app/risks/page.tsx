"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import roomRisk from "@/../public/figma/img/room-risk.jpg";
import { Button } from "@/components/ui/Button";
import { Furigana, plain } from "@/components/ui/Furigana";
import { DisclaimerFooter, StatusBar } from "@/components/ui/Screen";
import { type Risk, type RiskKind, type RoomObjectType } from "@/lib/content";
import { getSession, useSession } from "@/lib/session";
import { focusDescription } from "@/lib/focus-description";
import { SafetyProducts } from "@/components/SafetyProducts";
import { RISK_KINDS } from "@/lib/content";
import { useSettings } from "@/lib/settings";
import { roomAdviceImages, roomAdvice } from "@/lib/room-guidance";

function AdviceIllustration({ risk }: { risk: Risk }) {
  const [variant] = useState(() => Math.random());
  const image = roomAdviceImages(risk, variant)[0];
  return image ? <Image src={image.src} alt={image.alt} width={1536} height={1024} className="mt-3 h-auto w-full rounded-field" /> : null;
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
  const { risks, photoUrl, analysisSource, analysisWarning, checked, toggleChecked, update } = useSession();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = risks.find((risk) => risk.id === selectedId) ?? risks[0];
  const selectedIndex = selected ? risks.indexOf(selected) : -1;
  const selectedAdvice = selected ? roomAdvice(selected, audience) : null;
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
    setEditing(null);
  };

  const start = () => {
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
      <StatusBar />
      <main className="flex flex-1 flex-col gap-4 px-5 py-4">
        <div>
          <p className="text-11 font-bold text-primary-ink">体験の準備</p>
          <h1 className="mt-2 font-display text-xl font-bold"><Furigana text="部屋[へや]の危険[きけん]を確認[かくにん]しよう" adult="室内の危険候補を確認" /></h1>
          <p className="mt-2 text-13 text-ink-muted"><Furigana text="番号や名前を押すと、危険[きけん]の理由を確認[かくにん]できます。認識[にんしき]が違[ちが]うものは修正[しゅうせい]しよう。" adult="番号や名前を選ぶと、危険の理由と対策を確認できます。認識が違うものは修正してください。" /></p>
        </div>
        {analysisSource === "demo" && <p role="status" className="rounded-field bg-warn-soft p-3 text-11 text-warn">{analysisWarning ?? "サンプルの部屋で体験できます。"}</p>}
        <div id="selected-room-photo" tabIndex={-1} className="scroll-mt-4 overflow-hidden rounded-panel bg-ink">
        <div className="relative">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="体験に使う部屋" className="block h-auto w-full" />
          ) : <Image src={roomRisk} alt="サンプルの部屋" className="h-auto w-full" />}
          {selected?.bounds && <div aria-hidden className="pointer-events-none absolute rounded-field border-[3px] border-primary" style={{ left: `${selected.bounds.x}%`, top: `${selected.bounds.y}%`, width: `${selected.bounds.w}%`, height: `${selected.bounds.h}%` }} />}
          {risks.map((risk, index) => {
            const active = selected?.id === risk.id;
            const nearby = risks.slice(0, index).filter((other) => Math.hypot(other.x - risk.x, other.y - risk.y) < 12).length;
            const offsets = [[0, 0], [24, -24], [-24, 24], [24, 24], [-24, -24]];
            const [dx, dy] = offsets[nearby % offsets.length];
            return <button key={risk.id} type="button" aria-pressed={active} aria-label={`${index + 1}番・${plain(risk.name)}の説明を表示`} onClick={() => setSelectedId(risk.id)} className={`absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white font-bold text-ink shadow ${active ? "z-20 bg-primary" : "z-10 bg-surface"}`} style={{ left: `clamp(24px, calc(${risk.x}% + ${dx}px), calc(100% - 24px))`, top: `clamp(24px, calc(${risk.y}% + ${dy}px), calc(100% - 24px))` }}>{index + 1}</button>;
          })}
        </div>
        {selected && <div className="relative flex items-center gap-2 bg-ink p-3 text-white">
          <button type="button" aria-label="前の物体を表示" disabled={selectedIndex === 0} onClick={() => setSelectedId(risks[selectedIndex - 1].id)} className="size-11 shrink-0 rounded-full border border-white/50 disabled:opacity-30">←</button>
          <p aria-live="polite" className="min-w-0 flex-1 text-center text-sm font-bold">{selectedIndex + 1} / {risks.length} · <Furigana text={selected.name} adult={selected.adultName} /></p>
          <button type="button" aria-label="次の物体を表示" disabled={selectedIndex === risks.length - 1} onClick={() => setSelectedId(risks[selectedIndex + 1].id)} className="size-11 shrink-0 rounded-full border border-white/50 disabled:opacity-30">→</button>
        </div>}
        </div>
        {selected && selectedAdvice && <article className="rounded-panel bg-surface p-4" aria-live="polite">
          <p className="text-11 font-bold" style={{ color: RISK_KINDS[selected.kind].text }}><Furigana text={RISK_KINDS[selected.kind].label} /></p>
          <h2 className="mt-1 font-display text-lg font-bold">{selectedIndex + 1}. <Furigana text={selected.name} adult={selected.adultName} /></h2>
          <p className="mt-2 text-13 leading-relaxed text-ink-muted"><Furigana text={DANGER_TEXT[selected.kind].child} adult={DANGER_TEXT[selected.kind].adult} /></p>
          <AdviceIllustration key={selected.id} risk={selected} />
          <div className="mt-3 rounded-field bg-primary-soft p-3">
            <p className="text-11 font-bold text-primary-ink"><Furigana text="地震[じしん]の前[まえ]にできること" adult="事前にできる対策" /></p>
            <p className="mt-1 font-display text-15 font-bold"><Furigana text={selectedAdvice.headline} /></p>
            <ol className="mt-2 space-y-2">
              {selectedAdvice.steps.map((text, index) => <li key={text} className="flex gap-2 text-13"><span className="font-bold text-primary-ink">{index + 1}</span><Furigana text={text} /></li>)}
            </ol>
          </div>
          {selectedAdvice.detail && <div className="mt-3 rounded-field bg-canvas p-3">
            <h3 className="min-h-8 text-13 font-bold"><Furigana text="対策[たいさく]のポイント" adult="対策の詳細・注意点" /></h3>
            <p className="mt-2 text-base leading-relaxed"><Furigana text={selectedAdvice.detail} /></p>
          </div>}
          <label className="mt-4 flex min-h-12 cursor-pointer items-center gap-3 rounded-field border border-safe p-3 font-bold text-safe">
            <input type="checkbox" checked={checked.includes(`prepared:${selected.id}`)} onChange={() => toggleChecked(`prepared:${selected.id}`)} className="size-5 accent-teal-700" />
            <Furigana text="この家具・場所は対策[たいさく]済[ず]み" adult="この家具・場所は対策済み" />
          </label>
          <div className="mt-3"><SafetyProducts risks={[{ ...selected, confirmed: true }]} /></div>
        </article>}
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
                    <button type="button" aria-pressed={selected?.id === risk.id} aria-controls="selected-room-photo" className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-field px-2 text-left text-13 font-bold ${selected?.id === risk.id ? "bg-primary-soft text-primary-ink" : "text-ink"}`} onClick={() => { setSelectedId(risk.id); focusDescription("selected-room-photo"); }}>
                      <span>{index + 1}</span><Furigana text={risk.name} adult={risk.adultName} />
                    </button>
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
        <section className="rounded-panel bg-primary-soft p-5">
          <p className="text-sm font-bold text-primary-ink">備えを確認したら、次は行動の体験へ</p>
          <h2 className="mt-2 text-xl font-bold"><Furigana text="この部屋で、地震が起きたら？" /></h2>
          <p className="mt-2 text-base leading-relaxed"><Furigana text="今見た家具や場所のそばで揺れが始まったとき、どう動くかを選んでみよう。" adult="確認した家具や場所をもとに、揺れている間と収まった後の行動をシミュレーションします。" /></p>
        </section>
        <div className="sticky bottom-0 mt-auto flex flex-col gap-2 bg-canvas py-3">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="md" disabled={editing !== null || risks.length < 2} onClick={() => { setSelectedId(risks[(selectedIndex + 1) % risks.length].id); focusDescription("selected-room-photo"); }}><Furigana text={selectedIndex === risks.length - 1 ? "最初の家具へ" : "次の家具へ"} /></Button>
            <Button size="md" onClick={start} disabled={editing !== null}><Furigana text="行動クイズへ" /></Button>
          </div>
          <button type="button" onClick={() => router.push("/camera")} className="min-h-11 text-13 text-ink-muted underline">写真を撮り直す</button>
        </div>
      </main>
      <DisclaimerFooter />
    </div>
  );
}
