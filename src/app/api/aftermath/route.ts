import "server-only";
import { ApiError, createAftermath, errorResponse, parseRisks, readPhoto, withAi } from "@/lib/server/ai";
export const runtime = "nodejs";
export const maxDuration = 240;
export async function POST(request: Request) {
  try {
    const { photo, form } = await readPhoto(request);
    let raw: unknown;
    try { raw = JSON.parse(String(form.get("risks"))); }
    catch { throw new ApiError(400, "危険ポイントの形式が正しくありません。"); }
    const risks = parseRisks(raw);
    const result = risks.some((r) => r.confirmed)
      ? await withAi(() => createAftermath(photo, risks)) : { imageUrl: null, events: [] };
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
