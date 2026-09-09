"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraState = "idle" | "starting" | "live" | "denied" | "unavailable";

const MAX_PHOTO_EDGE = 1280;

/** API に送りやすい大きさへ縮小し、画面遷移後も使える data URL にする。 */
export async function preparePhoto(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

type MaskRegion = { x: number; y: number; w: number; h: number; shape: "rect" | "circle" };

/** 指定領域を画像データ自体から塗りつぶし、API へ元の情報を送らないようにする。 */
export async function applyPrivacyMasks(dataUrl: string, regions: MaskRegion[]): Promise<string> {
  if (regions.length === 0) return dataUrl;
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0);
  for (const region of regions) {
    const x = region.x / 100 * canvas.width;
    const y = region.y / 100 * canvas.height;
    const width = region.w / 100 * canvas.width;
    const height = region.h / 100 * canvas.height;
    context.save();
    context.fillStyle = "#d7d4cc";
    if (region.shape === "circle") {
      context.beginPath();
      context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillRect(x, y, width, height);
    }
    context.restore();
  }
  return canvas.toDataURL("image/jpeg", 0.82);
}

/**
 * 背面カメラのプレビューを <video> に流す。
 *
 * 権限が降りない・HTTPS でない・PC などで使えない場合は state が
 * "denied" / "unavailable" になるので、画面側でサンプル写真に切り替える。
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("idle");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return;
    }
    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setState("live");
    } catch (err) {
      // NotAllowedError は権限拒否、それ以外は端末側の都合
      setState((err as DOMException)?.name === "NotAllowedError" ? "denied" : "unavailable");
    }
  }, []);

  /** 現在のプレビューを 1 枚切り出す */
  const capture = useCallback(async (): Promise<{ blob: Blob; url: string } | null> => {
    const video = videoRef.current;
    if (!video || state !== "live" || !video.videoWidth) return null;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) return null;
    return { blob, url: canvas.toDataURL("image/jpeg", 0.82) };
  }, [state]);

  useEffect(() => stop, [stop]);

  return { videoRef, state, start, stop, capture };
}
