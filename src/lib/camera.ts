"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraState = "idle" | "starting" | "live" | "denied" | "unavailable";

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
    return { blob, url: URL.createObjectURL(blob) };
  }, [state]);

  useEffect(() => stop, [stop]);

  return { videoRef, state, start, stop, capture };
}
