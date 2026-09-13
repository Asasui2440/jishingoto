"use client";

import Image from "next/image";
import LiveRoomCamera from "@/components/LiveRoomCamera";
import { EyeOffIcon, MousePointerIcon } from "@/components/icons";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";
import { DisclaimerFooter } from "@/components/ui/Screen";
import type { BlurRegion } from "@/lib/api";
import { applyPrivacyMasks, preparePhoto } from "@/lib/camera";
import { composeRoomViews, extractVideoFrames, prepareRoomViews, selectedFrameIndices } from "@/lib/video-frames";
import { useSession } from "@/lib/session";
import { prepareMaskedRoom } from "@/lib/room-preparation";
import { setRoomTestOptions } from "@/lib/room-test";

export default function RoomCapture() {
  const router = useRouter();
  const { reset, update } = useSession();
  const photoFileInput = useRef<HTMLInputElement>(null);
  const videoFileInput = useRef<HTMLInputElement>(null);
  const operation = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const [frames, setFrames] = useState<string[]>([]);
  const [masks, setMasks] = useState<BlurRegion[][]>([]);
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [stage, setStage] = useState<"input" | "photo" | "video" | "privacy" | "preparing">("input");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => () => { operation.current?.abort(); }, []);

  const loadFile = async (file: File, duration?: number) => {
    if (locked.current) return;
    locked.current = true;
    const controller = new AbortController(); operation.current = controller;
    setFrames([]); setSelected([]); setReviewed([]);
    setStage("preparing"); setBusy("動画から画像を取り出しています…"); setError(""); setProgress(0);
    try {
      const isVideo = file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|ogv)$/i.test(file.name);
      if (!isVideo) {
        setBusy("写真を準備しています…");
        const photo = await preparePhoto(file);
        if (controller.signal.aborted) return;
        reset(); update({ photoUrl: photo, blurRegions: [] });
        router.push("/privacy");
        return;
      }
      const images = await extractVideoFrames(file, controller.signal, setProgress, duration);
      if (controller.signal.aborted) return;
      setFrames(images); setMasks(images.map(() => [])); setIndex(0); setReviewed([]);
      setSelected([]); setStage("preparing");
      setBusy("AIが写り方の違う画像を選んでいます…");
      const choices = await requestSelection(images, controller.signal);
      if (controller.signal.aborted) return;
      setSelected(choices); setIndex(choices[0]); setStage("privacy");
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "ファイルを読み込めませんでした。");
    } finally { locked.current = false; setBusy(""); }
  };

  const requestSelection = async (images: string[], signal: AbortSignal) => {
    const response = await fetch("/api/room/select-frames", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frames: images }), signal,
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "AIで画像を選べませんでした。");
    return selectedFrameIndices(body.indices, images.length);
  };

  const retrySelection = async () => {
    if (locked.current) return;
    locked.current = true; setBusy("AIが画像を選んでいます…"); setError("");
    const controller = new AbortController(); operation.current = controller;
    try {
      const choices = await requestSelection(frames, controller.signal);
      if (controller.signal.aborted) return;
      setSelected(choices); setReviewed([]); setIndex(choices[0]); setStage("privacy");
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "画像を選べませんでした。");
    } finally { locked.current = false; setBusy(""); }
  };

  const proceed = async (confirmed: number[]) => {
    if (locked.current || !selected.length || !selected.every(i => confirmed.includes(i))) return;
    locked.current = true; setBusy("部屋の確認を始めています…"); setError("");
    const controller = new AbortController(); operation.current = controller;
    try {
      const masked = await Promise.all(selected.map(i => applyPrivacyMasks(frames[i], masks[i])));
      const photo = await composeRoomViews(masked);
      const roomViews = await prepareRoomViews(masked);
      if (controller.signal.aborted) return;
      reset(); setRoomTestOptions({ mode: "live", analysisMs: 0, imageMs: 0 });
      update({ photoUrl: photo, roomViews, blurRegions: [] });
      void prepareMaskedRoom(photo);
      router.push("/analyzing");
    } catch {
      setError("画像を準備できませんでした。もう一度お試しください。");
      locked.current = false; setBusy("");
    }
  };

  return <div className="flex min-h-dvh flex-col">
    <main className="flex flex-1 flex-col gap-5 px-5 py-8">
      <h1 className="font-display text-28 font-bold"><Furigana text={stage === "input" ? "部屋を写そう" : stage === "photo" ? "写真を撮る" : stage === "video" ? "動画を撮る" : stage === "privacy" ? "画像の確認・マスク" : "部屋の画像を準備しています"} /></h1>
      {stage === "input" && <>
        <Image src="/illustrations/actions/room-wide-v7.png" width={1536} height={1024} alt="床・出入口・家具の上まで広く写した部屋のイラスト" className="h-auto w-full rounded-panel" priority />
        <p className="text-base leading-relaxed"><Furigana text="写真でも動画でも、部屋の様子を確認できます。動画は15秒ほどで、一定の速さで部屋を見回すように撮ろう。" /></p>
        <section aria-labelledby="photo-method" className="rounded-panel bg-primary-soft p-4">
          <h2 id="photo-method" className="mb-3 font-display text-xl font-bold"><Furigana text="写真" /></h2>
          <div className="grid grid-cols-2 gap-3">
            <Button aria-label="写真を撮影する" onClick={() => { setError(""); setStage("photo"); }} disabled={!!busy}><Furigana text="撮影する" /></Button>
            <Button variant="outline" onClick={() => photoFileInput.current?.click()} disabled={!!busy}><Furigana text="写真から選ぶ" /></Button>
          </div>
        </section>
        <section aria-labelledby="video-method" className="rounded-panel bg-primary-soft p-4">
          <h2 id="video-method" className="mb-3 font-display text-xl font-bold"><Furigana text="動画" /></h2>
          <div className="grid grid-cols-2 gap-3">
            <Button aria-label="動画を撮影する" onClick={() => { setError(""); setStage("video"); }} disabled={!!busy}><Furigana text="撮影する" /></Button>
            <Button variant="outline" onClick={() => videoFileInput.current?.click()} disabled={!!busy}><Furigana text="動画から選ぶ" /></Button>
          </div>
        </section>
        <input ref={photoFileInput} type="file" accept="image/*" aria-label="写真ファイルを選ぶ" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void loadFile(file); }} hidden />
        <input ref={videoFileInput} type="file" accept="video/*" aria-label="動画ファイルを選ぶ" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void loadFile(file); }} hidden />
      </>}
      {(stage === "photo" || stage === "video") && <LiveRoomCamera mode={stage} onCapture={(file, duration) => void loadFile(file, duration)} onBack={() => setStage("input")} />}
      {stage === "privacy" && <>
        <p className="font-bold text-primary-ink"><Furigana text={`AIが選んだ画像 ${selected.indexOf(index) + 1} / ${selected.length}`} /></p>
        <div className="rounded-panel bg-primary-soft p-4 text-base leading-relaxed"><Furigana text="顔や住所が写っていたら、画像をタップして隠そう。もう一度タップすると解除できます。隠すところがなければ、そのまま次へ進めます。" /></div>
        <div className="flex flex-wrap gap-2">{selected.map((i, position) => <button key={i} disabled={!!busy} aria-pressed={index === i} onClick={() => setIndex(i)} className={`min-h-11 min-w-11 rounded-field border-2 px-2 ${i === index ? "border-primary bg-primary-soft" : "border-border"}`}>{position + 1}{reviewed.includes(i) ? " ✓" : ""}</button>)}</div>
        <div className="relative cursor-crosshair overflow-hidden rounded-panel" onClick={event => {
          if (busy) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const x = Math.max(0, Math.min(78, (event.clientX - rect.left) / rect.width * 100 - 11));
          const y = Math.max(0, Math.min(82, (event.clientY - rect.top) / rect.height * 100 - 9));
          setMasks(prev => prev.map((list, i) => i === index ? [...list, { id: crypto.randomUUID(), x, y, w: 22, h: 18, shape: "rect" }] : list));
          setReviewed(prev => prev.filter(i => i !== index));
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={frames[index]} alt={`動画から取り出した候補 ${index + 1}`} className="block h-auto w-full" />
          {masks[index].map(mask => <button key={mask.id} aria-label="このマスクを消す" disabled={!!busy} className="absolute grid place-items-center rounded-field border-2 border-white bg-primary/85 backdrop-blur-md" style={{ left: `${mask.x}%`, top: `${mask.y}%`, width: `${mask.w}%`, height: `${mask.h}%` }} onClick={event => {
            event.stopPropagation(); setMasks(prev => prev.map((list, i) => i === index ? list.filter(m => m.id !== mask.id) : list)); setReviewed(prev => prev.filter(i => i !== index));
          }}>
            <span className="flex flex-col items-center gap-0.5">
              <EyeOffIcon className="size-4 text-ink" />
              <span className="font-display text-11 font-bold text-ink"><Furigana text="ぼかし済" /></span>
            </span>
          </button>)}
        </div>
        <p className="flex items-center justify-center gap-2 text-sm text-ink-muted">
          <MousePointerIcon className="size-4 shrink-0" />
          <Furigana text="顔や住所をタップして隠す" />
        </p>
        <Button disabled={!!busy} onClick={() => {
          const confirmed = [...new Set([...reviewed, index])];
          setReviewed(confirmed);
          const next = selected.find(i => !confirmed.includes(i));
          if (next !== undefined) setIndex(next);
          else void proceed(confirmed);
        }}><Furigana text={selected.some(i => i !== index && !reviewed.includes(i)) ? "この画像を確認して次へ" : "解析する"} /></Button>

      </>}
      {stage === "preparing" && error && <>
        {frames.length > 0 && <Button disabled={!!busy} onClick={() => void retrySelection()}><Furigana text="AIでもう一度選ぶ" /></Button>}
        <Button variant="outline" disabled={!!busy} onClick={() => { setFrames([]); setSelected([]); setError(""); setStage("input"); }}><Furigana text="動画を選び直す" /></Button>
      </>}
      {busy && <div role="status" className="rounded-panel bg-primary-soft p-4"><Furigana text={busy} />{busy === "動画から画像を取り出しています…" && <progress value={progress} max={1} aria-label="動画の読み込み" className="mt-3 w-full" />}</div>}
      {error && <p role="alert" className="text-base text-danger"><Furigana text={error} /></p>}
      <button type="button" className="min-h-11 text-base underline" onClick={() => { operation.current?.abort(); router.push("/"); }}><Furigana text="戻る" /></button>
    </main><DisclaimerFooter />
  </div>;
}
