import { roomViewBounds, type RoomView } from "./room-views";
/** 動画は端末内だけで読み、送信用の静止画候補に変換する。 */
export const MAX_VIDEO_SECONDS = 60;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_CANDIDATES = 8;
export const MAX_SELECTED = 3;

export function frameTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration < 1 || duration > MAX_VIDEO_SECONDS) {
    throw new Error("1〜60秒の動画を選んでください。");
  }
  const count = Math.min(MAX_CANDIDATES, Math.max(2, Math.ceil(duration / 2)));
  return Array.from({ length: count }, (_, index) => duration * (index + 0.5) / count);
}

/** 時間帯を偏らせず、各区間の前後も比較する。 */
export function frameWindows(duration: number): number[][] {
  const centers = frameTimes(duration);
  const width = duration / centers.length;
  return centers.map(center => [-0.4, -0.2, 0, 0.2, 0.4].map(offset => center + offset * width));
}

/** 小さな同一解像度画像の輪郭の明瞭さ。暗すぎる／白飛びした画像を抑える。 */
export function frameSharpness(data: Uint8ClampedArray, width: number, height: number): number {
  if (width < 3 || height < 3 || data.length !== width * height * 4) return 0;
  const gray = new Float64Array(width * height);
  let brightness = 0;
  for (let i = 0; i < gray.length; i++) {
    gray[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
    brightness += gray[i];
  }
  let sum = 0, squared = 0, count = 0;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const edge = gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i];
    sum += edge; squared += edge * edge; count++;
  }
  const mean = brightness / gray.length;
  const exposure = Math.min(1, mean / 35, (255 - mean) / 25);
  return Math.max(0, squared / count - (sum / count) ** 2) * exposure;
}

export function selectedFrameIndices(value: unknown, count: number): number[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SELECTED ||
      value.some(i => !Number.isInteger(i) || i < 0 || i >= count) || new Set(value).size !== value.length) {
    throw new Error("画像の選択結果を確認できませんでした。");
  }
  return value;
}

export async function extractVideoFrames(file: File, signal: AbortSignal, progress: (n: number) => void, recordedDuration?: number): Promise<string[]> {
  if (file.size > MAX_VIDEO_BYTES) throw new Error("100MB以下の動画を選んでください。");
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const url = URL.createObjectURL(file);
  const wait = (event: string, action: () => void) => new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener(event, done);
      video.removeEventListener("error", fail);
      signal.removeEventListener("abort", cancel);
    };
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("動画を読み込めませんでした。MP4など、この端末で再生できる動画を選んでください。")); };
    const cancel = () => { cleanup(); reject(new DOMException("中止", "AbortError")); };
    const timer = setTimeout(fail, 15_000);
    video.addEventListener(event, done, { once: true });
    video.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel(); else action();
  });
  try {
    await wait("loadedmetadata", () => { video.src = url; video.load(); });
    const windows = frameWindows(recordedDuration ?? video.duration);
    const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を準備できませんでした。");
    const preview = document.createElement("canvas");
    const previewScale = 160 / Math.max(canvas.width, canvas.height);
    preview.width = Math.max(3, Math.round(canvas.width * previewScale));
    preview.height = Math.max(3, Math.round(canvas.height * previewScale));
    const previewContext = preview.getContext("2d", { willReadFrequently: true });
    if (!previewContext) throw new Error("画像を比較できませんでした。");
    const frames: string[] = [];
    let done = 0;
    for (const times of windows) {
      let bestScore = -1;
      let bestFrame = "";
      for (const time of times) {
        await wait("seeked", () => { video.currentTime = time; });
        previewContext.drawImage(video, 0, 0, preview.width, preview.height);
        const score = frameSharpness(previewContext.getImageData(0, 0, preview.width, preview.height).data, preview.width, preview.height);
        if (score > bestScore) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          bestFrame = canvas.toDataURL("image/jpeg", 0.8);
          bestScore = score;
        }
        progress(++done / (windows.length * 5));
      }
      frames.push(bestFrame);
    }
    return frames;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** 異なる視点を接合せず、番号付きの一覧画像として保持する。枠も一覧全体の座標になる。 */
export async function composeRoomViews(frames: string[]): Promise<string> {
  if (!frames.length || frames.length > MAX_SELECTED) throw new Error("1〜3枚選んでください。");
  if (frames.length === 1) return frames[0];
  const images = await Promise.all(frames.map(async src => {
    const image = new Image(); image.src = src; await image.decode(); return image;
  }));
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 504 * Math.ceil(images.length / 2);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("画像を準備できませんでした。");
  context.fillStyle = "#f5f3ec"; context.fillRect(0, 0, canvas.width, canvas.height);
  images.forEach((image, i) => {
    const x = (i % 2) * 640; const y = Math.floor(i / 2) * 504;
    const bounds = roomViewBounds(image.width, image.height, i, images.length);
    context.drawImage(image, bounds.x / 100 * canvas.width, bounds.y / 100 * canvas.height, bounds.w / 100 * canvas.width, bounds.h / 100 * canvas.height);
    context.fillStyle = "#242424"; context.font = "bold 20px sans-serif";
    context.fillText(`視点 ${i + 1}`, x + 12, y + 24);
  });
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** 表示用にはマスク済みの元画像を保持し、解析用一覧の座標と対応させる。 */
export async function prepareRoomViews(frames: string[]): Promise<RoomView[]> {
  return Promise.all(frames.map(async (url, index) => {
    const image = new Image(); image.src = url; await image.decode();
    return { url, bounds: roomViewBounds(image.width, image.height, index, frames.length) };
  }));
}
