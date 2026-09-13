import { GeoError } from "@/lib/server/geo-analysis";
import {
  assessRouteCandidates,
  parseRouteAssessmentRequest,
} from "@/lib/server/route-assessment";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const expectedOrigin = `${url.protocol}//${request.headers.get("host") ?? url.host}`;
  if (origin && origin !== expectedOrigin)
    return Response.json(
      { code: "invalid_origin", message: "この画面からもう一度操作してください。" },
      { status: 403 },
    );

  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 320000)
    return Response.json(
      { code: "request_too_large", message: "経路データが大きすぎます。" },
      { status: 413 },
    );

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 320000)
      return Response.json(
        { code: "request_too_large", message: "経路データが大きすぎます。" },
        { status: 413 },
      );
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new GeoError("invalid_request", "経路データの形式が正しくありません。", 400);
    }
    return Response.json(assessRouteCandidates(parseRouteAssessmentRequest(raw)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const problem =
      error instanceof GeoError
        ? error
        : new GeoError("assessment_failed", "経路を比較できませんでした。", 502);
    return Response.json(
      { code: problem.code, message: problem.message },
      { status: problem.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
