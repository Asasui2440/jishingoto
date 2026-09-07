import "server-only";
import { analyzePhoto, errorResponse, readPhoto, withAi } from "@/lib/server/ai";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  try {
    const { photo, bytes } = await readPhoto(request);
    const risks = await withAi(() => analyzePhoto(photo, bytes));
    return Response.json(risks, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
