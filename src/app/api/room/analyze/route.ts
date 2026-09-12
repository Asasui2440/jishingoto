import { type Risk, type RiskKind, type RoomObjectType } from "@/lib/content";

export const runtime = "nodejs";
export const maxDuration = 45;

const OBJECT_TYPES = new Set<RoomObjectType>(["bookshelf", "cupboard", "elevated_objects", "tall_furniture", "tv", "window", "doorway", "hanging_object", "desk", "bed", "loose_objects", "other"]);
const RISK_KINDS = new Set<RiskKind>(["fall", "break", "block"]);

function extractJson(response: unknown): unknown {
  const data = response as { output?: { content?: { type?: string; text?: string }[] }[]; output_text?: string };
  const text = data.output_text ?? data.output?.flatMap((item) => item.content ?? []).find((part) => part.type === "output_text")?.text;
  if (!text) throw new Error("empty model response");
  return JSON.parse(text.replace(/^```json\s*|\s*```$/g, ""));
}

function sanitize(value: unknown): Risk[] {
  const items = (value as { risks?: unknown[] })?.risks;
  if (!Array.isArray(items)) return [];
  return items.slice(0, 8).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const kind = RISK_KINDS.has(row.kind as RiskKind) ? row.kind as RiskKind : null;
    const objectType = OBJECT_TYPES.has(row.objectType as RoomObjectType) ? row.objectType as RoomObjectType : "other";
    if (!kind || typeof row.name !== "string") return [];
    const clamp = (n: unknown, fallback: number) => typeof n === "number" && Number.isFinite(n) ? Math.min(95, Math.max(5, n)) : fallback;
    const confidence = typeof row.confidence === "number" ? Math.min(1, Math.max(0, row.confidence)) : 0.5;
    const box = row.bounds as Record<string, unknown> | undefined;
    let bounds: Risk["bounds"];
    if (box && [box.x, box.y, box.w, box.h].every((n) => typeof n === "number" && Number.isFinite(n)) && Number(box.w) > 0 && Number(box.h) > 0) {
      const x = Math.max(0, Math.min(99, Number(box.x)));
      const y = Math.max(0, Math.min(99, Number(box.y)));
      bounds = { x, y, w: Math.min(100 - x, Number(box.w)), h: Math.min(100 - y, Number(box.h)) };
    }
    return [{ id: `ai-${index}-${objectType}`, name: row.name.replaceAll("テレビ受像機", "テレビ").slice(0, 30), adultName: typeof row.adultName === "string" && row.adultName.trim() ? row.adultName.trim().replaceAll("テレビ受像機", "テレビ").slice(0, 60) : undefined, kind, objectType, confidence, bounds, x: bounds ? bounds.x + bounds.w / 2 : clamp(row.x, 50), y: bounds ? bounds.y + bounds.h / 2 : clamp(row.y, 50), confirmed: false }];
  });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "openai-not-configured" }, { status: 503 });

  let image: unknown;
  try {
    image = (await request.json() as { image?: unknown }).image;
  } catch {
    return Response.json({ error: "bad-json" }, { status: 400 });
  }
  if (typeof image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > 8_000_000) {
    return Response.json({ error: "bad-image" }, { status: 400 });
  }

  const prompt = `この部屋の写真を地震防災の観点で観察してください。実際に画像で確認できる危険候補だけを最大8件返してください。人物の特定や住所・文字の読み取りはしないでください。
JSONのみ: {"risks":[{"name":"小学校高学年にも分かる短い名前（テレビ受像機ではなくテレビなど、日常の呼び方）","adultName":"同じ対象を示す漢字中心の標準的な名称","kind":"fall|break|block","objectType":"bookshelf|cupboard|elevated_objects|tall_furniture|tv|window|doorway|hanging_object|desk|bed|loose_objects|other","confidence":0から1,"x":中心の横位置0から100,"y":中心の縦位置0から100}]}
食器棚はcupboard。棚の上・高い場所に置かれた物はelevated_objects（床置きのloose_objectsと区別する）。loose_objectsは床に置かれた物だけに使用する。対象が棚本体か棚上の物かを名前と枠で区別する。
kind: fall=倒れる/落ちる、break=割れる、block=出口や通路をふさぐ。棚上の物は主にfall。床や通路が写っていなければ散乱や通行障害を断定しない。固定状態や危険を断定せず、根拠が弱ければconfidenceを下げる。`;

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.OPENAI_VISION_MODEL ?? "gpt-5.6-luna", store: false, input: [{ role: "user", content: [{ type: "input_text", text: prompt + '\n各riskに対象物を囲むbounds:{"x":左端,"y":上端,"w":幅,"h":高さ}も含めてください。すべて元画像全体に対する0〜100の百分率。枠は画像内に収めてください。' }, { type: "input_image", image_url: image, detail: "high" }] }] }),
    });
  } catch {
    return Response.json({ error: "openai-unreachable" }, { status: 502 });
  }
  if (!upstream.ok) return Response.json({ error: "openai-error" }, { status: 502 });
  try {
    return Response.json({ risks: sanitize(extractJson(await upstream.json())), source: "ai" });
  } catch {
    return Response.json({ error: "invalid-openai-response" }, { status: 502 });
  }
}
