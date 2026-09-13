"use client";

import { useEffect, useRef, useState } from "react";
import { useCamera } from "@/lib/camera";
import { MAX_VIDEO_SECONDS } from "@/lib/video-frames";
import { Button } from "@/components/ui/Button";
import { Furigana } from "@/components/ui/Furigana";

export default function LiveRoomCamera({ mode, onCapture, onBack }: {
  mode: "photo" | "video";
  onCapture: (file: File, duration?: number) => void;
  onBack: () => void;
}) {
  const { videoRef, state, start, stop, capture } = useCamera();
  const recorder = useRef<MediaRecorder | null>(null);
  const active = useRef(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    active.current = true;
    void start();
    return () => {
      active.current = false;
      if (timer.current) clearInterval(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stop();
    };
  }, [start, stop]);

  const takePhoto = async () => {
    setBusy(true); setError("");
    try {
      const shot = await capture();
      if (!shot) throw new Error("写真を撮れませんでした。もう一度お試しください。");
      if (active.current) { stop(); onCapture(new File([shot.blob], "room.jpg", { type: "image/jpeg" })); }
    } catch (e) { if (active.current) { setError(e instanceof Error ? e.message : "撮影できませんでした。"); setBusy(false); } }
  };

  const startRecording = () => {
    setError("");
    try {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      if (!stream || typeof MediaRecorder === "undefined") throw new Error("このブラウザでは動画撮影ができません。写真を撮るか、保存した動画を選んでください。");
      const mimeType = ["video/mp4", "video/webm;codecs=vp8", "video/webm"].find(type => MediaRecorder.isTypeSupported(type));
      const media = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 2_000_000 });
      recorder.current = media;
      const chunks: Blob[] = [];
      const started = performance.now();
      let failed = false;
      media.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      media.onerror = () => { failed = true; if (timer.current) clearInterval(timer.current); if (active.current) { setRecording(false); setError("録画できませんでした。もう一度お試しください。"); } };
      media.onstop = () => {
        if (timer.current) clearInterval(timer.current);
        if (!active.current || failed) return;
        const duration = Math.min(MAX_VIDEO_SECONDS, (performance.now() - started) / 1000);
        setRecording(false);
        const type = media.mimeType || chunks[0]?.type || "video/webm";
        const blob = new Blob(chunks, { type });
        if (!blob.size || duration < 1) { setError("1秒以上撮影してください。"); return; }
        stop(); setBusy(true);
        onCapture(new File([blob], type.includes("mp4") ? "room.mp4" : "room.webm", { type }), duration);
      };
      media.start(250);
      setRecording(true); setSeconds(0);
      timer.current = setInterval(() => {
        const elapsed = (performance.now() - started) / 1000;
        setSeconds(Math.floor(elapsed));
        if (elapsed >= MAX_VIDEO_SECONDS && media.state === "recording") media.stop();
      }, 100);
    } catch (e) { setError(e instanceof Error ? e.message : "録画を開始できませんでした。"); }
  };

  return <div className="flex flex-col gap-4">
    <p className="text-base"><Furigana text={mode === "video" ? "一周15秒を目安に、一定の速さで部屋を写そう。" : "床・出入口・家具の上まで、広く写そう。"} /></p>
    <video ref={videoRef} autoPlay playsInline muted aria-label="カメラの映像" className="aspect-[3/4] w-full rounded-panel bg-black object-contain" />
    {state === "starting" && <p role="status"><Furigana text="カメラの許可を確認しています…" /></p>}
    {(state === "denied" || state === "unavailable") && <p role="alert" className="text-danger"><Furigana text={state === "denied" ? "カメラの使用を許可してください。戻って保存した写真や動画を選ぶこともできます。" : "カメラを起動できませんでした。接続やブラウザの設定を確認してください。"} /></p>}
    {recording && <p role="status" className="text-center font-bold text-danger">● <Furigana text={`録画中 ${seconds}秒`} /></p>}
    {mode === "photo" ? <Button disabled={state !== "live" || busy} onClick={() => void takePhoto()}><Furigana text="撮影する" /></Button>
      : recording ? <Button onClick={() => { if (recorder.current?.state === "recording") recorder.current.stop(); }}><Furigana text="撮影を終了する" /></Button>
        : <Button disabled={state !== "live" || busy} onClick={startRecording}><Furigana text="録画を開始する" /></Button>}
    {error && <p role="alert" className="text-danger"><Furigana text={error} /></p>}
    <Button variant="outline" onClick={onBack}><Furigana text={recording ? "撮影を取り消して戻る" : "方法を選び直す"} /></Button>
  </div>;
}
