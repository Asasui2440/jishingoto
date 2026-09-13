import { japaneseReadings } from "@/lib/japanese-readings";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 40_000) return Response.json({ error: "too-large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch { return Response.json({ error: "bad-json" }, { status: 400 }); }
  const texts = (body as { texts?: unknown } | null)?.texts;
  if (!Array.isArray(texts) || texts.length > 80 || !texts.every((text) => typeof text === "string" && text.length <= 3000)) {
    return Response.json({ error: "bad-texts" }, { status: 400 });
  }
  try {
    return Response.json({ readings: await Promise.all(texts.map(japaneseReadings)) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "readings-unavailable" }, { status: 503 }); }
}
