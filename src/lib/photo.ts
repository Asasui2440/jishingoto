import type { BlurRegion } from "./api";

/** Render to JPEG locally: strips file metadata and permanently covers privacy regions. */
export async function preparePhoto(url: string, regions: BlurRegion[] = []): Promise<Blob> {
  const image = new Image();
  image.src = url;
  try { await image.decode(); }
  catch { throw new Error("写真を開けませんでした。JPEG・PNG・WebPの写真を選んでください。"); }
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("写真を加工できませんでした。");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  // Opaque rectangles intentionally cover the entire selected area, including faces.
  ctx.fillStyle = "#333333";
  for (const r of regions) {
    ctx.fillRect(Math.floor(r.x * canvas.width / 100), Math.floor(r.y * canvas.height / 100),
      Math.ceil(r.w * canvas.width / 100) + 1, Math.ceil(r.h * canvas.height / 100) + 1);
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob || blob.size > 4 * 1024 * 1024) throw new Error("写真が大きすぎます。小さい写真を選んでください。");
  return blob;
}
