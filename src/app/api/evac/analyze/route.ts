import {
  analyzeGeoRoute,
  GeoError,
  parseGeoRequest,
} from "@/lib/server/geo-analysis";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Next.jsの内部URLがlocalhostに正規化されても、ブラウザが使ったHostで照合する。
  const url = new URL(request.url);
  const expectedOrigin = `${url.protocol}//${request.headers.get("host") ?? url.host}`;
  if (origin && origin !== expectedOrigin)
    return Response.json(
      {
        code: "invalid_origin",
        message: "この画面からもう一度操作してください。",
      },
      { status: 403 },
    );
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json(
      { code: "invalid_request", message: "経路を指定してください。" },
      { status: 400 },
    );
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 160000) {
        await reader.cancel();
        return Response.json(
          { code: "request_too_large", message: "経路データが大きすぎます。" },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const all = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.length;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(all));
    } catch {
      throw new GeoError(
        "invalid_request",
        "経路データの形式が正しくありません。",
        400,
      );
    }
    const result = await analyzeGeoRoute(parseGeoRequest(raw), request.signal);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const problem =
      error instanceof GeoError
        ? error
        : new GeoError(
            "analysis_failed",
            "解析に失敗しました。もう一度試してください。",
            502,
          );
    return Response.json(
      { code: problem.code, message: problem.message },
      { status: problem.status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
