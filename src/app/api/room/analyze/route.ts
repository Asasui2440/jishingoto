import mockResponse from "@/data/mock/room-analysis.json";
import { recognitionRequest, recognitionRisks, recognitionViews } from "@/lib/server/room-recognition";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  const mock = process.env.OPENAI_MOCK_MODE === "true";
  if (!apiKey && !mock) return Response.json({ error: "openai-not-configured" }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad-json" }, { status: 400 });
  }
  let views;
  try {
    views = recognitionViews(body);
  } catch {
    return Response.json({ error: "bad-image" }, { status: 400 });
  }

  if (mock) return Response.json(mockResponse, { headers: { "Cache-Control": "no-store" } });

  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(40_000)]),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(recognitionRequest(views, process.env.OPENAI_VISION_MODEL ?? "gpt-5.6-luna")),
    });
  } catch {
    return Response.json({ error: "openai-unreachable" }, { status: 502 });
  }
  if (!upstream.ok) return Response.json({ error: "openai-error" }, { status: 502 });
  try {
    const risks = recognitionRisks(await upstream.json(), views);
    return Response.json({ risks, source: "ai" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "invalid-openai-response" }, { status: 502 });
  }
}
