import { geoConfig } from "@/lib/server/geo-analysis";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(geoConfig(), {
    headers: { "Cache-Control": "no-store" },
  });
}
