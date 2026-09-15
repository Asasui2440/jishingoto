import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { aftermathPrompt, checkAftermath, parseAftermathObjects } from "@/lib/server/aftermath-image";
import mockResponse from "@/data/mock/room-aftermath.json";
export const runtime = "nodejs";
export const maxDuration = 240;

// base64 化後も Vercel の入出力上限に余裕を残す。
const MAX_IMAGE_CHARACTERS = 4_000_000;
const GENERATION_TIMEOUT_MS = 175_000;
function imageFile(dataUrl: string): File | null {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || dataUrl.length > MAX_IMAGE_CHARACTERS) return null;
  return new File([Buffer.from(match[2], "base64")], "room", { type: match[1] });
}

function retryDelay(response: Response): number | null {
  const value = response.headers.get("retry-after");
  if (!value) return 1_000;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(value) - Date.now();
  // 長い待機指示は短縮して再送しない。
  return Number.isFinite(ms) && ms >= 0 && ms <= 5_000 ? ms : null;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;
  const mock = process.env.OPENAI_MOCK_MODE === "true";
  const requestedQuality = process.env.OPENAI_IMAGE_QUALITY;
  const quality = requestedQuality === "low" || requestedQuality === "high" ? requestedQuality : "medium";
  // 比率を維持した軽量サイズも比較できる。未指定・不正値は従来の解像度。
  const size = process.env.OPENAI_IMAGE_SIZE === "1152x768" ? "1152x768" : "1536x1024";
  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
  const fail = (error: string, status = 502) => {
    console.warn("Room image result", { error, status, elapsedMs: Date.now() - startedAt, model, quality, size });
    return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
  };
  if (!apiKey && !mock) return fail("openai-not-configured", 503);
  if (Number(request.headers.get("content-length")) > 4_200_000) return fail("image-too-large", 413);
  let body: { image?: unknown; objects?: unknown };
  try { body = await request.json(); }
  catch { return fail("bad-json", 400); }
  if (typeof body?.image === "string" && body.image.length > MAX_IMAGE_CHARACTERS) return fail("image-too-large", 413);
  const file = typeof body?.image === "string" ? imageFile(body.image) : null;
  if (!file) return fail("bad-request", 400);
  let objects;
  try { objects = parseAftermathObjects(body.objects); }
  catch { return fail("bad-objects", 400); }
  if (mock) return Response.json(mockResponse, { headers: { "Cache-Control": "no-store" } });

  const form = new FormData();
  form.set("model", model);
  form.append("image[]", file);
  try {
    const style = await readFile(join(process.cwd(), "public/illustrations/room-style-reference.jpeg"));
    form.append("image[]", new File([style], "style-reference.jpeg", { type: "image/jpeg" }));
  } catch { return fail("style-reference-unavailable", 500); }
  form.set("size", size);
  form.set("quality", quality);
  form.set("output_format", "jpeg");
  form.set("output_compression", "85");
  form.set("prompt", aftermathPrompt(objects));
  // 再試行を含めた合計期限。比較と応答のための時間を残す。
  const signal = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
  let imageUrl: string | undefined;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const upstream = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal,
      });
      const json = await upstream.json().catch(error => { if (signal.aborted) throw error; return null; }) as {
        error?: { code?: string; type?: string }; data?: { b64_json?: string; url?: string }[];
      } | null;
      if (!upstream.ok) {
        const quota = [json?.error?.code, json?.error?.type].some(code => code === "insufficient_quota" || code === "billing_hard_limit_reached");
        const wait = retryDelay(upstream);
        // 明示的な一時拒否だけ1回再送。タイムアウトや不一致では二重生成しない。
        if (!attempt && !quota && [429, 503].includes(upstream.status) && wait !== null && !signal.aborted) {
          await new Promise(resolve => setTimeout(resolve, wait));
          signal.throwIfAborted();
          continue;
        }
        return fail(quota ? "openai-quota" : upstream.status === 429 ? "openai-rate-limit" : "openai-error");
      }
      if (!json) return fail("invalid-openai-response");
      const first = json.data?.[0];
      imageUrl = first?.b64_json ? `data:image/jpeg;base64,${first.b64_json}` : first?.url;
      break;
    }
  } catch (error) {
    return fail(signal.aborted || (error instanceof Error && error.name === "TimeoutError") ? "openai-timeout" : "openai-unreachable");
  }
  if (!imageUrl) return fail("missing-image");
  if (imageUrl.length > MAX_IMAGE_CHARACTERS) return fail("generated-image-too-large");
  const generationMs = Date.now() - startedAt;
  const verification = await checkAftermath(body.image as string, imageUrl, objects, apiKey!);
  if (verification === "mismatch") return fail("room-image-mismatch");
  console.info("Room image result", { verification, model, quality, size, generationMs, comparisonMs: Date.now() - startedAt - generationMs, elapsedMs: Date.now() - startedAt });
  return Response.json({ imageUrl, verification }, { headers: { "Cache-Control": "no-store" } });
}
